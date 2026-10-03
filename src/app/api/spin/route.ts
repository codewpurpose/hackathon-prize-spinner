import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, claimSpin, getSpin, hasValidOrigin, readSession, sendChoiceEmail } from "../../../server/auth";
import { choices } from "../../../wheel";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function currentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  if (!session && token) jar.delete(SESSION_COOKIE);
  return session;
}

export async function GET() {
  try {
    const session = await currentSession();
    if (!session) return reply({ error: "verification_required" }, 401);
    const choiceIndex = await getSpin(session.email);
    return reply({ verified: true, hasSpun: choiceIndex !== null, ...(choiceIndex === null ? {} : { choiceIndex }) });
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return reply({ error: "invalid_request" }, 403);
  try {
    const session = await currentSession();
    if (!session) return reply({ error: "verification_required" }, 401);
    const result = await claimSpin(session.email, session);
    const emailSent = result.alreadySpun ? undefined : await sendChoiceEmail(session, choices[result.choiceIndex]);
    return reply({ ...result, ...(emailSent === undefined ? {} : { emailSent }) }, result.alreadySpun ? 409 : 200);
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}
