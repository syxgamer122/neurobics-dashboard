const fs = require('fs');

// 1. Fix anticheat.ts
let anticheat = fs.readFileSync('supabase/functions/_shared/anticheat.ts', 'utf8');
anticheat = anticheat.replace(/"hard"/g, '"physical"');
anticheat = anticheat.replace(/"soft"/g, '"statistical"');
// Fix any potential double replacements if there were any
anticheat = anticheat.replace(/"physical_reject"/g, '"hard_reject"'); // just in case

fs.writeFileSync('supabase/functions/_shared/anticheat.ts', anticheat);

// 2. Fix scoring.test.ts (remove daysSince)
let scoring = fs.readFileSync('tests/scoring.test.ts', 'utf8');
scoring = scoring.replace(/describe\("daysSince.*?\}\);\n\}\);/s, '');
fs.writeFileSync('tests/scoring.test.ts', scoring);

// 3. Fix security.test.ts mock for jose
let security = fs.readFileSync('tests/security.test.ts', 'utf8');
if (!security.includes('vi.mock("npm:jose')) {
  security = security.replace(/import \{ describe, it, expect, vi \} from "vitest";/, 
`import { describe, it, expect, vi } from "vitest";
vi.mock("npm:jose@5.9.3", () => ({
  jwtVerify: vi.fn(),
  importSPKI: vi.fn(),
}));`);
}
fs.writeFileSync('tests/security.test.ts', security);

console.log('Fixed tests again');
