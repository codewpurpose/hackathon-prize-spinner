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
  return `<div style="font-family:Arial,sans-serif;color:#1e3c2c;max-width:520px;margin:24px auto;padding:28px;background:#fcf4e8;border-radius:18px"><p style="font-size:14px">CodeWithPurpose Hackathon</p><h1 style="font-size:26px">Your wheel code</h1><p>Hi ${escapedName}, enter this code on the spinner page to unlock your one spin:</p><p style="font-size:34px;font-weight:bold;letter-spacing:9px;background:#fffbf5;padding:18px;border-radius:12px;text-align:center">${code}</p><p>This code expires in 15 minutes. If it expires, request a new one from the page.</p><p>If you didn’t ask for this code, you can ignore this email.</p></div>`;
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
