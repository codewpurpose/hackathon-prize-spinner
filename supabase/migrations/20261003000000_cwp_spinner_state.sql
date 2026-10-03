-- Private, expiring state for the hackathon email-code gate and one-spin rule.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.cwp_state (
  state_key text primary key,
  state_value jsonb not null,
  expires_at timestamptz not null
);

alter table private.cwp_state enable row level security;
revoke all on private.cwp_state from public, anon, authenticated;
grant select, insert, update, delete on private.cwp_state to service_role;
create index if not exists cwp_state_expires_at_idx on private.cwp_state (expires_at);

create or replace function public.cwp_state_set(p_key text, p_value jsonb, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ttl_seconds < 1 or length(p_key) > 256 then
    raise exception 'Invalid state parameters';
  end if;

  delete from private.cwp_state where expires_at <= pg_catalog.clock_timestamp();
  insert into private.cwp_state (state_key, state_value, expires_at)
  values (p_key, p_value, pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_ttl_seconds))
  on conflict (state_key) do update
    set state_value = excluded.state_value, expires_at = excluded.expires_at;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cwp_state_get(p_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  delete from private.cwp_state where expires_at <= pg_catalog.clock_timestamp();
  select state_value into v_value from private.cwp_state
    where state_key = p_key and expires_at > pg_catalog.clock_timestamp();
  if not found then
    delete from private.cwp_state where state_key = p_key;
    return null;
  end if;
  return v_value;
end;
$$;

create or replace function public.cwp_state_delete(p_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from private.cwp_state where state_key = p_key;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

-- Sliding-window request limiter. The HMAC'd key is unique per purpose and
-- identity, so raw email addresses and IPs are never written to rate state.
create or replace function public.cwp_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_events jsonb;
  v_recent jsonb;
  v_now_ms bigint := floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_cutoff_ms bigint;
  v_first_ms bigint;
  v_last_ms bigint;
  v_count integer;
  v_reset_ms bigint;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) > 320 then
    raise exception 'Invalid rate limit parameters';
  end if;

  delete from private.cwp_state where expires_at <= pg_catalog.clock_timestamp();
  insert into private.cwp_state (state_key, state_value, expires_at)
  values (p_key, '[]'::jsonb, pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_window_seconds))
  on conflict (state_key) do nothing;

  select state_value into v_events from private.cwp_state where state_key = p_key for update;
  v_cutoff_ms := v_now_ms - (p_window_seconds::bigint * 1000);
  select coalesce(pg_catalog.jsonb_agg(e.value::bigint order by e.value::bigint), '[]'::jsonb),
         pg_catalog.min(e.value::bigint), pg_catalog.max(e.value::bigint)
    into v_recent, v_first_ms, v_last_ms
    from pg_catalog.jsonb_array_elements_text(v_events) as e(value)
   where e.value::bigint > v_cutoff_ms;
  v_count := pg_catalog.jsonb_array_length(v_recent);

  if v_count >= p_limit then
    v_reset_ms := v_first_ms + (p_window_seconds::bigint * 1000);
    update private.cwp_state set state_value = v_recent,
      expires_at = pg_catalog.to_timestamp((v_last_ms + p_window_seconds::bigint * 1000) / 1000.0)
      where state_key = p_key;
    return pg_catalog.jsonb_build_object('success', false, 'reset', v_reset_ms);
  end if;

  v_recent := v_recent || pg_catalog.to_jsonb(v_now_ms);
  v_first_ms := case when v_count = 0 then v_now_ms else v_first_ms end;
  v_last_ms := v_now_ms;
  v_reset_ms := v_first_ms + (p_window_seconds::bigint * 1000);
  update private.cwp_state set state_value = v_recent,
    expires_at = pg_catalog.to_timestamp((v_last_ms + p_window_seconds::bigint * 1000) / 1000.0)
    where state_key = p_key;
  return pg_catalog.jsonb_build_object('success', true, 'reset', v_reset_ms);
end;
$$;

create or replace function public.cwp_verify_challenge(p_key text, p_expected_code_hash text, p_max_attempts integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value jsonb;
  v_attempts integer;
begin
  select state_value into v_value from private.cwp_state
    where state_key = p_key and expires_at > pg_catalog.clock_timestamp() for update;
  if not found then
    delete from private.cwp_state where state_key = p_key;
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  v_attempts := (v_value ->> 'attempts')::integer;
  if v_attempts >= p_max_attempts then
    delete from private.cwp_state where state_key = p_key;
    return pg_catalog.jsonb_build_object('status', 'locked');
  end if;

  if v_value ->> 'codeHash' <> p_expected_code_hash then
    v_attempts := v_attempts + 1;
    if v_attempts >= p_max_attempts then
      delete from private.cwp_state where state_key = p_key;
      return pg_catalog.jsonb_build_object('status', 'locked');
    end if;
    update private.cwp_state set state_value = pg_catalog.jsonb_set(v_value, '{attempts}', pg_catalog.to_jsonb(v_attempts))
      where state_key = p_key;
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  delete from private.cwp_state where state_key = p_key;
  return pg_catalog.jsonb_build_object('status', 'verified', 'name', v_value ->> 'name', 'email', v_value ->> 'email');
end;
$$;

create or replace function public.cwp_claim_spin(p_key text, p_candidate integer, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value jsonb;
  v_inserted_key text;
begin
  if p_candidate < 0 or p_candidate > 10 or p_ttl_seconds < 1 then
    raise exception 'Invalid spin parameters';
  end if;

  delete from private.cwp_state where expires_at <= pg_catalog.clock_timestamp();
  insert into private.cwp_state (state_key, state_value, expires_at)
  values (p_key, pg_catalog.jsonb_build_object('choiceIndex', p_candidate),
          pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_ttl_seconds))
  on conflict (state_key) do nothing
  returning state_key into v_inserted_key;

  if found then
    return pg_catalog.jsonb_build_object('choiceIndex', p_candidate, 'alreadySpun', false);
  end if;

  select state_value into v_value from private.cwp_state where state_key = p_key for update;
  return pg_catalog.jsonb_build_object('choiceIndex', (v_value ->> 'choiceIndex')::integer, 'alreadySpun', true);
end;
$$;

revoke execute on function public.cwp_state_set(text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.cwp_state_get(text) from public, anon, authenticated;
revoke execute on function public.cwp_state_delete(text) from public, anon, authenticated;
revoke execute on function public.cwp_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.cwp_verify_challenge(text, text, integer) from public, anon, authenticated;
revoke execute on function public.cwp_claim_spin(text, integer, integer) from public, anon, authenticated;
grant execute on function public.cwp_state_set(text, jsonb, integer) to service_role;
grant execute on function public.cwp_state_get(text) to service_role;
grant execute on function public.cwp_state_delete(text) to service_role;
grant execute on function public.cwp_rate_limit(text, integer, integer) to service_role;
grant execute on function public.cwp_verify_challenge(text, text, integer) to service_role;
grant execute on function public.cwp_claim_spin(text, integer, integer) to service_role;
