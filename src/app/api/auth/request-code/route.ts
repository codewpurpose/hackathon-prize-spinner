import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  CODE_TTL_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  challengeKey,
  emailHtml,
  getRedis,
  getResend,
  hasValidOrigin,
  newChallenge,
  normalizeEmail,
  normalizeName,
  rateLimit,
  requestIp,
} from "../../../../server/auth";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return reply({ error: "invalid_request" }, 403);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return reply({ error: "invalid_input" }, 400);
    const input = body as { name?: unknown; email?: unknown };
    const name = normalizeName(input.name);
    const email = normalizeEmail(input.email);
    if (!name || !email) return reply({ error: "invalid_input" }, 400);
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) return reply({ error: "service_unavailable" }, 503);
    const resend = getResend();

    const emailBucket = challengeKey(email).slice(4);
    const ip = requestIp(request);
    const [emailLimit, ipLimit, cooldown] = await Promise.all([
      rateLimit(emailBucket, "cwp:otp-email", 3, "15 m"),
      ip ? rateLimit(ip, "cwp:otp-ip", 10, "1 h") : Promise.resolve({ success: true, reset: 0 }),
      rateLimit(emailBucket, "cwp:otp-cooldown", 1, "1 m"),
    ]);
    if (!emailLimit.success || !ipLimit.success || !cooldown.success) {
      const retryAfter = Math.max(...[
        !emailLimit.success ? emailLimit.reset : 0,
        !ipLimit.success ? ipLimit.reset : 0,
        !cooldown.success ? cooldown.reset : 0,
      ]);
      return reply({ error: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil((retryAfter - Date.now()) / 1000)) }, 429);
    }

    const challenge = newChallenge({ name, email });
    const key = challengeKey(email);
    const redis = getRedis();
    await redis.set(key, challenge.stored, { ex: CODE_TTL_SECONDS });
    let error;
    try {
      ({ error } = await resend.emails.send({
        from,
        to: [email],
        subject: "Your CodeWithPurpose wheel code",
        html: emailHtml(name, challenge.code),
        text: `Hi ${name}, your CodeWithPurpose wheel code is ${challenge.code}. It expires in 15 minutes. If it expires, request a new one from the page.`,
      }, { idempotencyKey: `cwp-wheel-code/${randomUUID()}` }));
    } catch {
      await redis.del(key);
      return reply({ error: "email_unavailable" }, 502);
    }
    if (error) {
      await redis.del(key);
      return reply({ error: "email_unavailable" }, 502);
    }
    return reply({ ok: true, expiresInSeconds: CODE_TTL_SECONDS, resendAfterSeconds: RESEND_COOLDOWN_SECONDS });
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}
