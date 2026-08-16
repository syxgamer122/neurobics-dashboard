import { describe, it, expect, vi } from "vitest";
import { requireAdmin } from "../supabase/functions/server/security";
import { adminClient } from "../supabase/functions/server/config";

// Mock adminClient
vi.mock("../supabase/functions/server/config", () => ({
  adminClient: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe("requireAdmin JWT verification", () => {
  it("rejects forged JWTs even if the payload claims aal2", async () => {
    // A self-signed or forged token. The payload decodes to { "aal": "aal2" }
    const forgedPayload = btoa(JSON.stringify({ aal: "aal2" }));
    const fakeToken = `header.${forgedPayload}.forged_signature`;

    const mockany = {
      req: {
        header: (name: string) => {
          if (name === "Authorization") return `Bearer ${fakeToken}`;
          return null;
        },
      },
    } as unknown as any;

    // Simulate Supabase rejecting the forged signature
    vi.mocked(adminClient.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: new Error("Invalid JWT signature"),
    } as any);

    await expect(requireAdmin(mockany)).rejects.toThrow("Invalid or expired session");
    
    // Ensure getUser was actually called with the fake token
    expect(adminClient.auth.getUser).toHaveBeenCalledWith(fakeToken);
  });
});
import { AUTH_EMAIL_DOMAIN, LEGACY_AUTH_EMAIL_DOMAINS } from "../src/app/lib/api/auth";
describe("Auth Domains", () => {
  it("auth domains must be distinct", () => {
    const all = [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS];
    expect(new Set(all).size).toBe(all.length);
  });
});
