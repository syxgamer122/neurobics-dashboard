const fs = require('fs');
let c = fs.readFileSync('supabase/functions/_shared/scoring/validation.ts', 'utf8');
c = c.replace('import type { Game } from "./core.ts";', 'import type { Game } from "./core.ts";\nimport { HUMAN_FLOOR_MS } from "../limits.ts";');
c = c.replace('throw new Error(`${label}: reaction time is not a valid positive number`);', 'throw new Error(`${label}: reaction time is not a valid positive number`);\n    if (r > 0 && r < HUMAN_FLOOR_MS) throw new Error(`${label}: reaction time too fast (${r}ms < ${HUMAN_FLOOR_MS}ms)`);');
fs.writeFileSync('supabase/functions/_shared/scoring/validation.ts', c);
