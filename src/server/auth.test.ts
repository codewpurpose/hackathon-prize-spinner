import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  claimUniqueSpin,
  escapeHtml,
  hasValidOrigin,
  makeCode,
  newChallenge,
  normalizeEmail,
  normalizeName,
  validCode,
  type SpinStore,
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

test("atomically grants one spin and returns the same result to concurrent retries", async () => {
  const values = new Map<string, string>();
  const store: SpinStore = {
    async get<T>(key: string) { return (values.get(key) ?? null) as T | null; },
    async set(key, value) {
      if (values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
  };
  const picks = [4, 9];
  const [first, concurrent] = await Promise.all([
    claimUniqueSpin(store, "spin:test", 3600, () => picks[0]),
    claimUniqueSpin(store, "spin:test", 3600, () => picks[1]),
  ]);
  assert.equal(first.choiceIndex, concurrent.choiceIndex);
  assert.deepEqual([first.alreadySpun, concurrent.alreadySpun].sort(), [false, true]);
  assert.ok([4, 9].includes(first.choiceIndex));
  const retry = await claimUniqueSpin(store, "spin:test", 3600, () => 2);
  assert.deepEqual(retry, { choiceIndex: first.choiceIndex, alreadySpun: true });
});
