import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── Mocks (hoisted, no network) ─────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getAccessToken: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../src/app/lib/api/internal", () => ({
  BASE: "https://example.supabase.co/functions/v1/server",
  sanitizeProfile: (p: unknown) => p,
  getSupabase: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn(),
    },
  }),
  getAccessToken: mocks.getAccessToken,
}));

vi.mock("../src/app/lib/logger", () => ({
  logError: mocks.logError,
}));

vi.mock("../src/app/lib/supabase-config", () => ({
  SUPABASE_ANON_KEY: "test-anon-key",
}));

import {
  normalizeUsername,
  assertValidUsername,
  USERNAME_RE,
  AUTH_EMAIL_DOMAIN,
  LEGACY_AUTH_EMAIL_DOMAINS,
  handleSignUp,
  handleGuestSignUp,
  handleLogin,
  handleUpgradeGuest,
  handleRecoverGuest,
} from "../src/app/lib/api/auth";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const MOCK_BASE = "https://example.supabase.co/functions/v1/server";

function mockFetchOk(payload: Record<string, unknown>): void {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response);
}

function mockFetchErr(status: number, payload: Record<string, unknown>): void {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: async () => payload,
  } as Response);
}

function mockSignInOk(token = "tok-123"): void {
  mocks.signInWithPassword.mockResolvedValue({
    data: { session: { access_token: token } },
    error: null,
  });
}

function invalidCredsError(): Record<string, string> {
  return { code: "invalid_credentials", message: "Invalid login credentials" };
}

function lastFetch(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return { url: String(call[0]), init: call[1] };
}

function fetchPayload(): Record<string, unknown> {
  const { init } = lastFetch();
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  fetchMock.mockReset();
  mocks.signInWithPassword.mockReset();
  mocks.getAccessToken.mockReset();
  mocks.logError.mockClear();
  mockSignInOk();
  mocks.getAccessToken.mockResolvedValue("sess-token");
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("username helpers", () => {
  it("normalizeUsername trims and lowercases", () => {
    expect(normalizeUsername("  AbC_X-1. ")).toBe("abc_x-1.");
  });

  it("assertValidUsername accepts valid names and normalizes", () => {
    expect(assertValidUsername("  Player_01 ")).toBe("player_01");
  });

  it("assertValidUsername rejects spaces/@/unicode/too-short", () => {
    for (const bad of ["ab", "has space", "has@at", "unicode-é", ""]) {
      expect(() => assertValidUsername(bad)).toThrow();
    }
  });

  it("USERNAME_RE allows 3-20 of [a-z0-9_.-]", () => {
    expect(USERNAME_RE.test("abc")).toBe(true);
    expect(USERNAME_RE.test("a".repeat(20))).toBe(true);
    expect(USERNAME_RE.test("ab")).toBe(false);
    expect(USERNAME_RE.test("a".repeat(21))).toBe(false);
    expect(USERNAME_RE.test("bad name")).toBe(false);
  });

  it("AUTH_EMAIL_DOMAIN distinct from legacy domains", () => {
    const all = [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS];
    expect(new Set(all).size).toBe(all.length);
  });
});

// ─── File contract (server canonical, no prefix drift) ───────────────────────

describe("auth.ts contract with server routes", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "lib", "api", "auth.ts"),
    "utf8",
  );

  it("calls canonical upgrade-account endpoint", () => {
    expect(src).toContain("upgrade-account");
  });

  it("does not call removed upgrade-guest endpoint", () => {
    expect(src).not.toContain("upgrade-guest");
  });

  it("exposes recoveryCode from guest signup", () => {
    expect(src).toContain("recoveryCode");
  });

  it("exports handleRecoverGuest hitting /recover", () => {
    expect(src).toContain("handleRecoverGuest");
    expect(src).toContain("/recover");
  });

  it("maps upgrade payload to newUsername/newPassword/newEmail", () => {
    expect(src).toContain("newUsername");
    expect(src).toContain("newPassword");
    expect(src).toContain("newEmail");
  });

  it("never logs email lists", () => {
    expect(src).not.toContain("emails.join");
  });
});

// ─── handleSignUp ────────────────────────────────────────────────────────────

describe("handleSignUp", () => {
  it("throws on short password before fetch", async () => {
    await expect(handleSignUp("player01", "short", "cap")).rejects.toThrow(
      /at least 8/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on empty captcha before fetch", async () => {
    await expect(
      handleSignUp("player01", "long-enough-pw", "   "),
    ).rejects.toThrow(/captcha/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on invalid username before fetch", async () => {
    await expect(
      handleSignUp("bad name", "long-enough-pw", "cap"),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts normalized signup then logs in and returns profile", async () => {
    const profile = { id: "u1", username: "player01" };
    mockFetchOk({ profile });
    const out = await handleSignUp("  Player01 ", "long-enough-pw", "cap-tok");
    expect(out).toEqual({ profile });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastFetch().url).toBe(`${MOCK_BASE}/signup`);
    expect(fetchPayload()).toMatchObject({
      username: "player01",
      password: "long-enough-pw",
      captchaToken: "cap-tok",
      isAdult: true,
    });
    expect(mocks.signInWithPassword).toHaveBeenCalled();
  });
});

// ─── handleGuestSignUp ───────────────────────────────────────────────────────

describe("handleGuestSignUp", () => {
  it("returns profile + recoveryCode + guestUsername without leaking _guestPw", async () => {
    const profile = { id: "g1", username: "guest_x" };
    mockFetchOk({
      profile,
      _guestName: "guest_x",
      _guestPw: "secret-pw",
      recoveryCode: "RC-123",
    });
    const out = await handleGuestSignUp("cap-tok");
    expect(out.profile).toEqual(profile);
    expect(out.recoveryCode).toBe("RC-123");
    expect(out.guestUsername).toBe("guest_x");
    expect(out).not.toHaveProperty("_guestPw");
    // Internal login used the guest credentials.
    expect(mocks.signInWithPassword).toHaveBeenCalled();
    // Recovery code must never reach logs.
    const logged = JSON.stringify(mocks.logError.mock.calls);
    expect(logged).not.toContain("RC-123");
    expect(logged).not.toContain("secret-pw");
  });

  it("still returns profile when server omits recoveryCode", async () => {
    const profile = { id: "g2", username: "guest_y" };
    mockFetchOk({ profile, _guestName: "guest_y", _guestPw: "pw-y" });
    const out = await handleGuestSignUp("cap-tok");
    expect(out.profile).toEqual(profile);
    expect(out.recoveryCode).toBeUndefined();
    expect(out.guestUsername).toBe("guest_y");
  });
});

// ─── handleLogin (redacted logs, fallback, fail-fast) ────────────────────────

describe("handleLogin", () => {
  it("throws on empty username/password without network", async () => {
    await expect(handleLogin("   ", "pw")).rejects.toThrow(/username/i);
    await expect(handleLogin("user", "")).rejects.toThrow(/password/i);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not log email addresses on failure", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: invalidCredsError(),
    });
    await expect(handleLogin("someuser", "wrong")).rejects.toThrow();
    expect(mocks.logError).toHaveBeenCalled();
    const logged = JSON.stringify(mocks.logError.mock.calls);
    expect(logged).not.toContain("@");
    expect(logged).not.toContain("mindgem.local");
    expect(logged).not.toContain("neurobics.local");
  });

  it("retries legacy domain only on invalid_credentials", async () => {
    mocks.signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null },
        error: invalidCredsError(),
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "tok-legacy" } },
        error: null,
      });
    const tok = await handleLogin("legacyuser", "pw");
    expect(tok).toBe("tok-legacy");
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("fail-fast on non-credential errors (no legacy retry)", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "over_request_rate_limit", message: "rate limited" },
    });
    await expect(handleLogin("user", "pw")).rejects.toThrow(/rate limited/i);
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

// ─── handleUpgradeGuest (canonical endpoint, no auto-login) ──────────────────

describe("handleUpgradeGuest", () => {
  it("posts to upgrade-account with new field mapping", async () => {
    mockFetchOk({
      success: true,
      username: "newname",
      requiresLogin: true,
      pendingVerification: false,
    });
    const out = await handleUpgradeGuest(
      "  NewName ",
      "me@mail.com",
      "long-enough-pw",
      true,
    );
    expect(lastFetch().url).toBe(`${MOCK_BASE}/upgrade-account`);
    expect(fetchPayload()).toMatchObject({
      newUsername: "newname",
      newPassword: "long-enough-pw",
      newEmail: "me@mail.com",
      isAdult: true,
    });
    expect(out).toEqual({
      success: true,
      username: "newname",
      requiresLogin: true,
      pendingVerification: false,
    });
    // Server signed out globally — client must NOT auto-login.
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns without login when pendingVerification is true", async () => {
    mockFetchOk({
      success: true,
      username: "newname",
      requiresLogin: true,
      pendingVerification: true,
    });
    const out = await handleUpgradeGuest(
      "newname",
      "me@mail.com",
      "long-enough-pw",
      true,
    );
    expect(out.pendingVerification).toBe(true);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("omits newEmail when email is empty (server uses spoofed)", async () => {
    mockFetchOk({
      success: true,
      username: "newname",
      requiresLogin: true,
      pendingVerification: false,
    });
    await handleUpgradeGuest("newname", "   ", "long-enough-pw", true);
    const payload = fetchPayload();
    expect(payload.newUsername).toBe("newname");
    expect(payload.newEmail ?? undefined).toBeUndefined();
  });

  it("validates username/password/login before fetch", async () => {
    await expect(
      handleUpgradeGuest("bad name", "a@b.c", "long-enough-pw", true),
    ).rejects.toThrow();
    await expect(
      handleUpgradeGuest("goodname", "a@b.c", "short", true),
    ).rejects.toThrow(/at least 8/i);
    mocks.getAccessToken.mockResolvedValueOnce(null);
    await expect(
      handleUpgradeGuest("goodname", "a@b.c", "long-enough-pw", true),
    ).rejects.toThrow(/not logged in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces server errors", async () => {
    mockFetchErr(409, { error: "Username is not available" });
    await expect(
      handleUpgradeGuest("taken", "a@b.c", "long-enough-pw", true),
    ).rejects.toThrow(/not available/i);
  });
});

// ─── handleRecoverGuest ──────────────────────────────────────────────────────

describe("handleRecoverGuest", () => {
  it("throws on empty code before fetch", async () => {
    await expect(handleRecoverGuest("   ")).rejects.toThrow(/recovery code/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts recoveryCode and returns guest credentials", async () => {
    mockFetchOk({ _guestName: "guest_z", _guestPw: "new-pw-z" });
    const out = await handleRecoverGuest(" RC-Z ");
    expect(lastFetch().url).toBe(`${MOCK_BASE}/recover`);
    expect(fetchPayload()).toMatchObject({ recoveryCode: "RC-Z" });
    expect(out).toEqual({ _guestName: "guest_z", _guestPw: "new-pw-z" });
  });

  it("surfaces invalid/expired codes", async () => {
    mockFetchErr(404, { error: "Invalid or expired recovery code" });
    await expect(handleRecoverGuest("BAD")).rejects.toThrow(/invalid|expired/i);
  });
});
