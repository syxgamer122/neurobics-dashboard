const fs = require('fs');
let code = fs.readFileSync('tests/security.test.ts', 'utf8');
code += `
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
`;
fs.writeFileSync('tests/security.test.ts', code);
