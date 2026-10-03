import { createHmac, randomInt, randomUUID } from "node:crypto";
import { Resend } from "resend";

export const SPIN_WINDOW_SECONDS = 24 * 60 * 60;

export type Identity = { name: string; email: string };
export type AccountIdentity = Identity & { userId: string };

let resendClient: Resend | undefined;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRpc<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return await response.json() as T;
}

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return secret;
}

export function normalizeEmail(email: unknown) {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizeName(name: unknown) {
  if (typeof name !== "string") return null;
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export function spinKey(userId: string) {
  if (!userId || userId.length > 256) throw new Error("Invalid CWP account ID");
  const digest = createHmac("sha256", authSecret()).update(`user:${userId}`).digest("hex");
  return `spin:${digest}`;
}

export function verifiedIdentity(input: {
  userId: string | null | undefined;
  name: string | null | undefined;
  email: unknown;
  emailVerified: boolean;
}): AccountIdentity | null {
  if (!input.userId || !input.emailVerified) return null;
  const email = normalizeEmail(input.email);
  if (!email) return null;
  const name = normalizeName(input.name) ?? "CWP member";
  return { userId: input.userId, name, email };
}

export function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? requestUrl.protocol.slice(0, -1);
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch { return false; }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function choiceEmailHtml(name: string, choice: string) {
  const escapedName = escapeHtml(name);
  const escapedChoice = escapeHtml(choice);
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Your hackathon choice</title></head>
  <body style="margin:0;padding:0;background-color:#f5f3e9;font-family:Arial,Helvetica,sans-serif;color:#254733;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3e9;"><tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#fffdf7;border:1px solid #e2e5d8;border-radius:16px;overflow:hidden;">
        <tr><td style="height:7px;background-color:#d5aa4e;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 36px 8px;"><p style="margin:0;color:#526b4d;font-size:12px;font-weight:bold;letter-spacing:1.5px;line-height:18px;text-transform:uppercase;">CodeWithPurpose</p><p style="margin:6px 0 0;color:#71806b;font-size:13px;line-height:20px;">Hackathon · Your wheel result</p></td></tr>
        <tr><td style="padding:22px 36px 30px;"><h1 style="margin:0;color:#254733;font-size:28px;line-height:36px;">Your choice is in!</h1><p style="margin:16px 0 0;color:#425347;font-size:16px;line-height:26px;">Hi ${escapedName}, your spin landed on:</p><p style="margin:20px 0;padding:20px 12px;border:1px solid #e2e7d8;border-radius:12px;background-color:#f3f4e9;color:#254733;text-align:center;font-size:34px;font-weight:bold;line-height:42px;">${escapedChoice}</p><p style="margin:0;color:#425347;font-size:14px;line-height:22px;">Keep this email as a reminder of your hackathon choice. Have fun building!</p></td></tr>
      </table>
      <p style="margin:18px 0 0;color:#74806d;font-size:12px;line-height:18px;text-align:center;">A little creativity can make a big difference.</p>
    </td></tr></table>
  </body>
</html>`;
}

export async function sendChoiceEmail(identity: Identity, choice: string) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return false;
  try {
    const { error } = await getResend().emails.send({
      from,
      to: [identity.email],
      subject: `Your CodeWithPurpose Hackathon choice: ${choice}`,
      html: choiceEmailHtml(identity.name, choice),
      text: `Hi ${identity.name}, your CodeWithPurpose Hackathon spin landed on ${choice}. Keep this email as a reminder of your choice. Have fun building!`,
    }, { idempotencyKey: `cwp-spin-result/${randomUUID()}` });
    return !error;
  } catch {
    return false;
  }
}

export async function getSpin(userId: string) {
  const value = await supabaseRpc<{ choiceIndex?: number } | null>("cwp_state_get", { p_key: spinKey(userId) });
  return value && Number.isInteger(value.choiceIndex) && value.choiceIndex! >= 0 && value.choiceIndex! < 11
    ? value.choiceIndex!
    : null;
}

export async function claimSpin(userId: string) {
  const result = await supabaseRpc<{ choiceIndex: number; alreadySpun: boolean }>("cwp_claim_spin", {
    p_key: spinKey(userId), p_candidate: randomInt(0, 11), p_ttl_seconds: SPIN_WINDOW_SECONDS,
  });
  if (!Number.isInteger(result.choiceIndex) || result.choiceIndex < 0 || result.choiceIndex > 10) throw new Error("Supabase returned an invalid spin result");
  return result;
}
