import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { Resend } from "resend";

export const CODE_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const SESSION_COOKIE = "cwp_spin_session";
const CHALLENGE_ATTEMPTS = 5;

export type Identity = { name: string; email: string };
export type Session = Identity & { expiresAt: number };

let redisClient: Redis | undefined;
let resendClient: Resend | undefined;

export function getRedis() {
  if (!redisClient) redisClient = Redis.fromEnv();
  return redisClient;
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

const VERIFY_CHALLENGE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({status='expired'}) end
local challenge = cjson.decode(raw)
if tonumber(challenge.attempts) >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({status='locked'})
end
if challenge.codeHash ~= ARGV[1] then
  challenge.attempts = tonumber(challenge.attempts) + 1
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 1 then ttl = 1 end
  redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
  local status = 'invalid'
  if tonumber(challenge.attempts) >= tonumber(ARGV[2]) then
    redis.call('DEL', KEYS[1])
    status = 'locked'
  end
  return cjson.encode({status=status, attempts=challenge.attempts})
end
redis.call('DEL', KEYS[1])
return cjson.encode({status='verified', name=challenge.name, email=challenge.email})
`;

export async function verifyChallenge(email: string, code: string): Promise<
  | { status: "verified"; identity: Identity }
  | { status: "invalid" | "locked" | "expired" }
> {
  // Compare fixed-length digests in Lua so wrong-code counters cannot race.
  const digest = codeDigest(email, code);
  const result = await getRedis().eval<[string, string], string>(VERIFY_CHALLENGE_SCRIPT, [challengeKey(email)], [digest, String(CHALLENGE_ATTEMPTS)]);
  const parsed = typeof result === "string" ? JSON.parse(result) as { status: string; name?: string; email?: string } : { status: "expired" };
  if (parsed.status === "verified" && parsed.name && parsed.email) {
    return { status: "verified", identity: { name: parsed.name, email: parsed.email } };
  }
  if (parsed.status === "invalid" || parsed.status === "locked") return { status: parsed.status };
  return { status: "expired" };
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 100) return null;
  const value = await getRedis().get<Session>(sessionKey(token));
  if (!value || typeof value !== "object" || !value.email || !value.name || !value.expiresAt) return null;
  if (value.expiresAt <= Date.now()) return null;
  return value;
}

export async function rateLimit(key: string, prefix: string, limit: number, window: `${number} m` | `${number} h`) {
  const limiter = new Ratelimit({ redis: getRedis(), limiter: Ratelimit.slidingWindow(limit, window), prefix });
  return limiter.limit(key);
}

export function requestIp(request: Request) {
  const direct = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-nf-client-connection-ip");
  if (direct && direct.length <= 64) return direct;
  // Trusted hosting proxies append the address they observe to this chain.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
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

export async function claimSpin(email: string, session: Session) {
  const ttl = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
  return claimUniqueSpin(getRedis(), spinKey(email), ttl);
}

export type SpinStore = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: string, options: { ex: number; nx: true }): Promise<string | null>;
};

export async function claimUniqueSpin(store: SpinStore, key: string, ttl: number, choose: () => number = () => randomInt(0, 11)) {
  const current = await store.get<string>(key);
  if (current !== null) return { choiceIndex: parseChoiceIndex(current), alreadySpun: true };
  const candidate = choose();
  const claimed = await store.set(key, String(candidate), { ex: ttl, nx: true });
  if (claimed === "OK") return { choiceIndex: candidate, alreadySpun: false };
  const winner = await store.get<string>(key);
  if (winner === null) throw new Error("Could not claim spin");
  return { choiceIndex: parseChoiceIndex(winner), alreadySpun: true };
}

function parseChoiceIndex(value: string) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > 10) throw new Error("Invalid stored spin");
  return index;
}

export async function getSpin(email: string) {
  const value = await getRedis().get<string>(spinKey(email));
  if (value === null || value === undefined) return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < 11 ? index : null;
}
