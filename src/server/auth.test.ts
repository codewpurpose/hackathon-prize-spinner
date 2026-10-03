import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SPIN_WINDOW_SECONDS,
  choiceEmailHtml,
  claimSpin,
  escapeHtml,
  getSpin,
  hasValidOrigin,
  normalizeEmail,
  normalizeName,
  sendChoiceEmail,
  spinKey,
  verifiedIdentity,
} from "./auth.ts";

process.env.AUTH_SECRET ??= "test-only-auth-secret-that-is-at-least-32-chars";

test("normalizes account email and display name", () => {
  assert.equal(normalizeName("  Ada   Lovelace "), "Ada Lovelace");
  assert.equal(normalizeEmail(" ADA@Example.org "), "ada@example.org");
  assert.equal(normalizeName("  "), null);
  assert.equal(normalizeName("a".repeat(81)), null);
  assert.equal(normalizeEmail("ada@example"), null);
});

test("only a verified CWP primary email produces an eligible identity", () => {
  assert.deepEqual(verifiedIdentity({
    userId: "user_123",
    name: "Ada Lovelace",
    email: " ADA@Example.org ",
    emailVerified: true,
  }), { userId: "user_123", name: "Ada Lovelace", email: "ada@example.org" });
  assert.deepEqual(verifiedIdentity({
    userId: "user_123",
    name: null,
    email: "ada@example.org",
    emailVerified: true,
  }), { userId: "user_123", name: "CWP member", email: "ada@example.org" });
  assert.equal(verifiedIdentity({ userId: "user_123", name: "Ada", email: "ada@example.org", emailVerified: false }), null);
  assert.equal(verifiedIdentity({ userId: "user_123", name: "Ada", email: "broken", emailVerified: true }), null);
  assert.equal(verifiedIdentity({ userId: null, name: "Ada", email: "ada@example.org", emailVerified: true }), null);
});

test("account spin keys are stable, opaque, and distinct per CWP account", () => {
  const first = spinKey("user_123");
  assert.equal(spinKey("user_123"), first);
  assert.notEqual(spinKey("user_456"), first);
  assert.match(first, /^spin:[a-f0-9]{64}$/);
  assert.equal(first.includes("user_123"), false);
});

test("claims one account spin with a fresh 24-hour expiry and validates the choice", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url: String(input), body });
    return new Response(JSON.stringify({ choiceIndex: 2, alreadySpun: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  try {
    assert.deepEqual(await claimSpin("user_123"), { choiceIndex: 2, alreadySpun: false });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/rpc\/cwp_claim_spin$/);
    assert.equal(requests[0].body.p_key, spinKey("user_123"));
    assert.equal(requests[0].body.p_ttl_seconds, SPIN_WINDOW_SECONDS);
    assert.ok(Number.isInteger(requests[0].body.p_candidate));
    assert.ok((requests[0].body.p_candidate as number) >= 0 && (requests[0].body.p_candidate as number) <= 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test("loads only the saved result for the authenticated account ID", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choiceIndex: 10 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  try {
    assert.equal(await getSpin("user_123"), 1);
    assert.equal(requestBody?.p_key, spinKey("user_123"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test("maps a previously saved A–K spin to the new raffle prize for the existing 24-hour window", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ choiceIndex: 10, alreadySpun: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";

  try {
    assert.deepEqual(await claimSpin("user_123"), { choiceIndex: 1, alreadySpun: true });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test("escapes names and choice text before inserting them into result email HTML", () => {
  assert.equal(escapeHtml(`<img src="x" onerror='bad'>`), "&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;");
  const html = choiceEmailHtml(`<img src=x onerror=alert(1)>`, "Swedish Fish");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("Swedish Fish"));
  assert.ok(!html.includes("<img src=x"));
});

test("sends the result to the verified account email through Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  let requestBody: Record<string, unknown> | undefined;
  let idempotencyKey: string | null = null;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "CWP <spins@example.org>";
  globalThis.fetch = (async (input, init) => {
    assert.match(String(input), /api\.resend\.com\/emails/);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    idempotencyKey = new Headers(init?.headers).get("idempotency-key");
    return new Response(JSON.stringify({ id: "email-test-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    assert.equal(await sendChoiceEmail({ name: "Ada", email: "ada@example.org" }, "Swedish Fish"), true);
    assert.deepEqual(requestBody?.to, ["ada@example.org"]);
    assert.equal(requestBody?.subject, "Your CodeWithPurpose Hackathon raffle result: Swedish Fish");
    assert.match(String(requestBody?.html), /Swedish Fish/);
    assert.match(idempotencyKey ?? "", /^cwp-spin-result\/[0-9a-f-]{36}$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
  }
});

test("requires same-origin spin mutations behind a local or production proxy", () => {
  const local = new Request("http://0.0.0.0:5173/api/spin", {
    method: "POST",
    headers: { origin: "http://localhost:5173", host: "localhost:5173" },
  });
  const crossSite = new Request("http://0.0.0.0:5173/api/spin", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "localhost:5173" },
  });
  assert.equal(hasValidOrigin(local), true);
  assert.equal(hasValidOrigin(crossSite), false);
});
