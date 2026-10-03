import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { claimSpin, getSpin, hasValidOrigin, sendChoiceEmail, verifiedIdentity } from "../../../server/auth";
import { choices } from "../../../wheel";

export const runtime = "nodejs";

function reply(body: object, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function currentIdentity() {
  const { userId } = await auth();
  if (!userId) return { status: "signed_out" as const };

  const user = await currentUser();
  if (!user || user.id !== userId) return { status: "signed_out" as const };
  const primaryEmail = user.primaryEmailAddress;
  const identity = verifiedIdentity({
    userId,
    name: user.fullName ?? user.firstName,
    email: primaryEmail?.emailAddress,
    emailVerified: primaryEmail?.verification?.status === "verified",
  });
  return identity ? { status: "verified" as const, identity } : { status: "email_unverified" as const };
}

function accessFailure(status: "signed_out" | "email_unverified") {
  return status === "signed_out"
    ? reply({ error: "authentication_required" }, 401)
    : reply({ error: "verified_email_required" }, 403);
}

export async function GET() {
  try {
    const account = await currentIdentity();
    if (account.status !== "verified") return accessFailure(account.status);

    const choiceIndex = await getSpin(account.identity.userId);
    return reply({
      authenticated: true,
      hasSpun: choiceIndex !== null,
      ...(choiceIndex === null ? {} : { choiceIndex }),
    });
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return reply({ error: "invalid_request" }, 403);
  try {
    const account = await currentIdentity();
    if (account.status !== "verified") return accessFailure(account.status);

    const result = await claimSpin(account.identity.userId);
    const emailSent = result.alreadySpun
      ? undefined
      : await sendChoiceEmail(account.identity, choices[result.choiceIndex]);
    return reply({ ...result, ...(emailSent === undefined ? {} : { emailSent }) }, result.alreadySpun ? 409 : 200);
  } catch {
    return reply({ error: "service_unavailable" }, 503);
  }
}
