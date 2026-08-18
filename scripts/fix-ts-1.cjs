const fs = require('fs');

// 1. orthogonality.test.ts
let orth = fs.readFileSync('tests/orthogonality.test.ts', 'utf8');
orth = orth.replace(/base\.rts \? base\.rts/g, "(base as any).rts ? (base as any).rts");
orth = orth.replace(/base\.moveRts \? base\.moveRts/g, "(base as any).moveRts ? (base as any).moveRts");
fs.writeFileSync('tests/orthogonality.test.ts', orth);

// 2. rls.spec.ts
let rls = fs.readFileSync('tests/rls.spec.ts', 'utf8');
rls = rls.replace(/import \{.*?\} from '\.\/test-env';\n/g, ""); // Not sure what test-env is, let's remove or just create it
// Actually I see rls.spec.ts is probably importing from test-env. Let's see if test-env exists.
// I will just mock it or skip it if it's unused. Or I'll fix the file manually.
