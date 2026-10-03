import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Resend } from "resend";

export const CODE_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const SESSION_COOKIE = "cwp_spin_session";
const CHALLENGE_ATTEMPTS = 5;

export type Identity = { name: string; email: string };
export type Session = Identity & { expiresAt: number };
type LimitResult = { success: boolean; reset: number };

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

export function validCode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}

export function makeCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function emailDigest(email: string) {
  return createHmac("sha256", authSecret()).update(`email:${email}`).digest("hex");
}

function codeDigest(email: string, code: string) {
  return createHmac("sha256", authSecret()).update(`code:${email}:${code}`).digest("hex");
}

function rateDigest(value: string) {
  return createHmac("sha256", authSecret()).update(`rate:${value}`).digest("hex");
}

export function challengeKey(email: string) { return `otp:${emailDigest(email)}`; }
export function spinKey(email: string) { return `spin:${emailDigest(email)}`; }

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionKey(token: string) {
  return `session:${createHash("sha256").update(token).digest("hex")}`;
}

export function newChallenge(identity: Identity) {
  const code = makeCode();
  return {
    code,
    stored: JSON.stringify({
      ...identity,
      codeHash: codeDigest(identity.email, code),
      attempts: 0,
      expiresAt: Date.now() + CODE_TTL_SECONDS * 1000,
    }),
  };
}

export async function storeChallenge(email: string, stored: string) {
  await supabaseRpc<null>("cwp_state_set", {
    p_key: challengeKey(email), p_value: JSON.parse(stored), p_ttl_seconds: CODE_TTL_SECONDS,
  });
}

export async function deleteChallenge(email: string) {
  await supabaseRpc<null>("cwp_state_delete", { p_key: challengeKey(email) });
}

export async function verifyChallenge(email: string, code: string): Promise<
  | { status: "verified"; identity: Identity }
  | { status: "invalid" | "locked" | "expired" }
> {
  const result = await supabaseRpc<{ status: string; name?: string; email?: string }>("cwp_verify_challenge", {
    p_key: challengeKey(email), p_expected_code_hash: codeDigest(email, code), p_max_attempts: CHALLENGE_ATTEMPTS,
  });
  if (result.status === "verified" && result.name && result.email) {
    return { status: "verified", identity: { name: result.name, email: result.email } };
  }
  if (result.status === "invalid" || result.status === "locked") return { status: result.status };
  return { status: "expired" };
}

export async function writeSession(token: string, session: Session) {
  const ttl = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
  await supabaseRpc<null>("cwp_state_set", { p_key: sessionKey(token), p_value: session, p_ttl_seconds: ttl });
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 100) return null;
  const value = await supabaseRpc<Session | null>("cwp_state_get", { p_key: sessionKey(token) });
  if (!value || typeof value !== "object" || !value.email || !value.name || !value.expiresAt) return null;
  if (value.expiresAt <= Date.now()) return null;
  return value;
}

export async function rateLimit(key: string, prefix: string, limit: number, window: `${number} m` | `${number} h`) {
  const seconds = window.endsWith(" m") ? Number.parseInt(window, 10) * 60 : Number.parseInt(window, 10) * 3600;
  return await supabaseRpc<LimitResult>("cwp_rate_limit", {
    p_key: `rate:${prefix}:${rateDigest(key)}`, p_limit: limit, p_window_seconds: seconds,
  });
}

export function requestIp(request: Request) {
  // Read provider headers that the hosting edge sets authoritatively. Only trust
  // Vercel's forwarded address when its platform marker is present; arbitrary
  // x-real-ip and x-forwarded-for values are client-controlled on other hosts.
  const direct = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-nf-client-connection-ip");
  if (direct && direct.length <= 64) return direct;
  if (!request.headers.has("x-vercel-id")) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length <= 64 ? forwarded : null;
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

export function emailHtml(name: string, code: string) {
  const escapedName = escapeHtml(name);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Your Hackathon sign-in code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f3e9;font-family:Arial,Helvetica,sans-serif;color:#254733;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your one-time CodeWithPurpose Hackathon sign-in code is inside.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3e9;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#fffdf7;border:1px solid #e2e5d8;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="height:7px;background-color:#d5aa4e;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:30px 36px 8px;">
                <p style="margin:0;color:#526b4d;font-size:12px;font-weight:bold;letter-spacing:1.5px;line-height:18px;text-transform:uppercase;">CodeWithPurpose</p>
                <p style="margin:6px 0 0;color:#71806b;font-size:13px;line-height:20px;">Hackathon · Spinner access</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 0;">
                <h1 style="margin:0;color:#254733;font-size:28px;font-weight:700;line-height:36px;">Your sign-in code</h1>
                <p style="margin:16px 0 0;color:#425347;font-size:16px;line-height:26px;">Hi ${escapedName},</p>
                <p style="margin:4px 0 0;color:#425347;font-size:16px;line-height:26px;">Enter this one-time code on the spinner page to unlock your one spin.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4e9;border:1px solid #e2e7d8;border-radius:12px;">
                  <tr>
                    <td align="center" style="padding:20px 12px 22px;">
                      <p style="margin:0 0 8px;color:#64725f;font-size:11px;font-weight:bold;letter-spacing:1.5px;line-height:16px;text-transform:uppercase;">Your six-digit code</p>
                      <p style="margin:0;color:#254733;font-family:'Courier New',monospace;font-size:36px;font-weight:bold;letter-spacing:8px;line-height:46px;">${code}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 30px;">
                <p style="margin:0;color:#425347;font-size:14px;line-height:22px;"><strong>This code expires in 15 minutes.</strong> If it expires, request a new one from the spinner page.</p>
                <p style="margin:16px 0 0;color:#71806b;font-size:13px;line-height:21px;">If you didn’t request this code, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#74806d;font-size:12px;line-height:18px;text-align:center;">A little creativity can make a big difference.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

export async function getSpin(email: string) {
  const value = await supabaseRpc<{ choiceIndex?: number } | null>("cwp_state_get", { p_key: spinKey(email) });
  return value && Number.isInteger(value.choiceIndex) && value.choiceIndex! >= 0 && value.choiceIndex! < 11
    ? value.choiceIndex!
    : null;
}

export async function claimSpin(email: string, session: Session) {
  const ttl = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
  const result = await supabaseRpc<{ choiceIndex: number; alreadySpun: boolean }>("cwp_claim_spin", {
    p_key: spinKey(email), p_candidate: randomInt(0, 11), p_ttl_seconds: ttl,
  });
  if (!Number.isInteger(result.choiceIndex) || result.choiceIndex < 0 || result.choiceIndex > 10) throw new Error("Supabase returned an invalid spin result");
  return result;
}
