import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  challengeKey,
  hasValidOrigin,
  newSessionToken,
  normalizeEmail,
  rateLimit,
  requestIp,
  verifyChallenge,
  validCode,
  writeSession,
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
    const input = body as { email?: unknown; code?: unknown };
    const email = normalizeEmail(input.email);
    if (!email || !validCode(input.code)) return reply({ error: "invalid_input" }, 400);

    const emailBucket = challengeKey(email).slice(4);
    const [emailLimit, ipLimit] = await Promise.all([
      rateLimit(emailBucket, "cwp:verify-email", 12, "15 m"),
      requestIp(request) ? rateLimit(requestIp(request)!, "cwp:verify-ip", 40, "1 h") : Promise.resolve({ success: true, reset: 0 }),
    ]);
    if (!emailLimit.success || !ipLimit.success) return reply({ error: "rate_limited" }, 429);

    const verification = await verifyChallenge(email, input.code);
    if (verification.status !== "verified") {
      if (verification.status === "expired") return reply({ error: "code_expired" }, 410);
      if (verification.status === "locked") return reply({ error: "too_many_attempts" }, 429);
      return reply({ error: "invalid_code" }, 400);
    }

    const token = newSessionToken();
    const session = { ...verification.identity, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 };
    await writeSession(token, session);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return reply({ ok: true, expiresInSeconds: SESSION_TTL_SECONDS });
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}
