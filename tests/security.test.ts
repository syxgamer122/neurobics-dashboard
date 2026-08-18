import { describe, it, expect, vi } from "vitest";
vi.mock("npm:jose@5.9.3", () => ({
  jwtVerify: vi.fn(),
  importSPKI: vi.fn(),
}));
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

import { clientIp } from "../supabase/functions/server/security";

describe("clientIp", () => {
  it("extracts rightmost untrusted IP from x-forwarded-for", () => {
    // With TRUSTED_PROXY_HOPS = 1, the trusted proxy is the last one (Edge).
    // The IP before that is the untrusted client.
    const mockContext = (xff: string) => ({
      req: {
        header: (n: string) => n === "x-forwarded-for" ? xff : null
      }
    } as any);

    // Standard case: client -> trusted proxy
    expect(clientIp(mockContext("203.0.113.1, 198.51.100.1"))).toBe("203.0.113.1");

    // Spoofed case: spoofed_client -> real_client -> trusted_proxy
    // Since TRUSTED_PROXY_HOPS = 1, it should take real_client, NOT spoofed_client
    expect(clientIp(mockContext("1.2.3.4, 203.0.113.1, 198.51.100.1"))).toBe("203.0.113.1");

    // Only one IP (e.g. direct connection or proxy didn't append)
    expect(clientIp(mockContext("203.0.113.1"))).toBe("203.0.113.1");

    // Empty or no header
    expect(clientIp(mockContext(""))).toBe("unknown");
    expect(clientIp({ req: { header: () => null } } as any)).toBe("unknown");
  });
});
