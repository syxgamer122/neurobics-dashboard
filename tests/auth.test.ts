import { expect, test } from "vitest";
import { AUTH_EMAIL_DOMAIN, LEGACY_AUTH_EMAIL_DOMAINS } from "../src/app/lib/api/auth";

test("auth domains must be distinct", () => {
  const all = [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS];
  expect(new Set(all).size).toBe(all.length);
});

test("signup email uses current domain", () => {
  const buildSignupEmail = (u: string) => `${u}@${AUTH_EMAIL_DOMAIN}`;
  expect(buildSignupEmail("abc")).toBe(`abc@${AUTH_EMAIL_DOMAIN}`);
  expect(buildSignupEmail("abc")).not.toMatch(/neurobics/);
});
