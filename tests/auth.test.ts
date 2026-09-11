import { describe, expect, it, test } from "vitest";
import {
  AUTH_EMAIL_DOMAIN,
  LEGACY_AUTH_EMAIL_DOMAINS,
  normalizeUsername,
  assertValidUsername,
  USERNAME_RE,
} from "../src/app/lib/api/auth";
import {
  RECOVERY_LIMIT,
  RECOVERY_WINDOW_SECONDS,
  SIGNUP_LIMIT,
  SIGNUP_WINDOW_SECONDS,
} from "../supabase/functions/server/config";

test("auth domains must be distinct", () => {
  const all = [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS];
  expect(new Set(all).size).toBe(all.length);
});

test("signup email uses current domain", () => {
  const buildSignupEmail = (u: string) => `${u}@${AUTH_EMAIL_DOMAIN}`;
  expect(buildSignupEmail("abc")).toBe(`abc@${AUTH_EMAIL_DOMAIN}`);
  expect(buildSignupEmail("abc")).not.toMatch(/neurobics/);
});

describe("Username validation and normalization", () => {
  it("normalizes usernames by trimming and converting to lowercase", () => {
    expect(normalizeUsername("  PlayerOne  ")).toBe("playerone");
    expect(normalizeUsername("TestUser123")).toBe("testuser123");
    expect(normalizeUsername("ADMIN_USER")).toBe("admin_user");
  });

  it("validates compliant usernames", () => {
    const validNames = [
      "alex",
      "user_123",
      "gamer.pro",
      "speed-demon",
      "a1_.-b2",
    ];
    for (const name of validNames) {
      expect(USERNAME_RE.test(name)).toBe(true);
      expect(assertValidUsername(name)).toBe(name.toLowerCase());
    }
  });

  it("rejects invalid usernames", () => {
    const invalidNames = [
      "ab", // Too short (< 3)
      "a_very_long_username_exceeding_limit", // Too long (> 20)
      "user@domain.com", // Contains @
      "hello world", // Contains space
      "nguyễn_văn_a", // Unicode characters
      "hack$$$", // Special characters
      "", // Empty
    ];
    for (const name of invalidNames) {
      expect(USERNAME_RE.test(name)).toBe(false);
      expect(() => assertValidUsername(name)).toThrow();
    }
  });
});

describe("Security and Rate Limit Invariants", () => {
  it("verifies signup and recovery rate limits are configured safely", () => {
    expect(SIGNUP_LIMIT).toBeGreaterThanOrEqual(5);
    expect(SIGNUP_WINDOW_SECONDS).toBeGreaterThanOrEqual(300);
    expect(RECOVERY_LIMIT).toBeGreaterThanOrEqual(5);
    expect(RECOVERY_WINDOW_SECONDS).toBeGreaterThanOrEqual(1800);
  });
});
