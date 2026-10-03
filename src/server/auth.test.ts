import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  choiceEmailHtml,
  challengeKey,
  escapeHtml,
  hasValidOrigin,
  makeCode,
  newChallenge,
  newSessionToken,
  normalizeEmail,
  normalizeName,
  requestIp,
  sessionKey,
  sendChoiceEmail,
  spinKey,
  validCode,
} from "./auth.ts";

process.env.AUTH_SECRET ??= "test-only-auth-secret-that-is-at-least-32-chars";

test("normalizes names and email addresses while rejecting malformed input", () => {
  assert.equal(normalizeName("  Ada   Lovelace "), "Ada Lovelace");
  assert.equal(normalizeEmail(" ADA@Example.org "), "ada@example.org");
  assert.equal(normalizeName("  "), null);
  assert.equal(normalizeName("a".repeat(81)), null);
  assert.equal(normalizeEmail("ada@example"), null);
  assert.equal(normalizeEmail("a".repeat(250) + "@x.io"), null);
});

test("creates a six-digit challenge that expires after fifteen minutes", () => {
  const before = Date.now();
  const { code, stored } = newChallenge({ name: "Ada", email: "ada@example.org" });
  const challenge = JSON.parse(stored) as { name: string; email: string; codeHash: string; attempts: number; expiresAt: number };
  assert.match(code, /^\d{6}$/);
  assert.equal(validCode(code), true);
  assert.equal(validCode("12345"), false);
  assert.equal(challenge.name, "Ada");
  assert.equal(challenge.email, "ada@example.org");
  assert.notEqual(challenge.codeHash, code);
  assert.equal(challenge.attempts, 0);
  assert.ok(challenge.expiresAt >= before + CODE_TTL_SECONDS * 1000);
  assert.ok(challenge.expiresAt <= Date.now() + CODE_TTL_SECONDS * 1000);
  assert.equal(SESSION_TTL_SECONDS, 24 * 60 * 60);
});

test("escapes visitor names before inserting them into the email template", () => {
  assert.equal(escapeHtml(`<img src="x" onerror='bad'>`), "&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;");
});

test("escapes visitor details in the result email", () => {
  const html = choiceEmailHtml(`<img src=x onerror=alert(1)>`, "Choice K");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("Choice K"));
  assert.ok(!html.includes("<img src=x"));
});

test("sends the selected result through Resend with a safe retry key", async () => {
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
    assert.equal(await sendChoiceEmail({ name: "Ada", email: "ada@example.org" }, "Choice K"), true);
    assert.deepEqual(requestBody?.to, ["ada@example.org"]);
    assert.equal(requestBody?.subject, "Your CodeWithPurpose Hackathon choice: Choice K");
    assert.match(String(requestBody?.html), /Choice K/);
    assert.match(idempotencyKey ?? "", /^cwp-spin-result\/[0-9a-f-]{36}$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
  }
});

test("checks request origin against the public host behind a local or production proxy", () => {
  const local = new Request("http://0.0.0.0:5173/api/auth/request-code/", {
    method: "POST",
    headers: { origin: "http://localhost:5173", host: "localhost:5173" },
  });
  const crossSite = new Request("http://0.0.0.0:5173/api/auth/request-code/", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "localhost:5173" },
  });
  assert.equal(hasValidOrigin(local), true);
  assert.equal(hasValidOrigin(crossSite), false);
});

test("uses the client IP set by the hosting edge for request limits", () => {
  const vercel = new Request("https://example.org/api/auth/request-code/", {
    headers: { "x-vercel-id": "sfo1::test", "x-forwarded-for": "203.0.113.4, 10.0.0.1", "x-real-ip": "198.51.100.9" },
  });
  assert.equal(requestIp(vercel), "203.0.113.4");

  const untrusted = new Request("https://example.org/api/auth/request-code/", {
    headers: { "x-forwarded-for": "203.0.113.4", "x-real-ip": "198.51.100.9" },
  });
  assert.equal(requestIp(untrusted), null);

  const cloudflare = new Request("https://example.org/api/auth/request-code/", {
    headers: { "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.1" },
  });
  assert.equal(requestIp(cloudflare), "203.0.113.8");
});

test("database keys conceal visitor email and cookie secrets", () => {
  process.env.AUTH_SECRET = "test-only-auth-secret-that-is-at-least-32-chars";
  const email = "ada@example.org";
  const token = newSessionToken();
  assert.match(challengeKey(email), /^otp:[a-f0-9]{64}$/);
  assert.match(spinKey(email), /^spin:[a-f0-9]{64}$/);
  assert.match(sessionKey(token), /^session:[a-f0-9]{64}$/);
  assert.equal(challengeKey(email).includes(email), false);
  assert.equal(sessionKey(token).includes(token), false);
});
