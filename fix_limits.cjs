const fs = require('fs');

// 1. Move limits
let limitsPath = 'supabase/functions/_shared/limits.ts';
let limits = fs.readFileSync(limitsPath, 'utf8');
if (!limits.includes('HUMAN_FLOOR_MS')) {
  limits += '\nexport const HUMAN_FLOOR_MS = 80;\n';
  fs.writeFileSync(limitsPath, limits);
}

// 2. Update anticheat.ts
let antiPath = 'supabase/functions/_shared/anticheat.ts';
let anti = fs.readFileSync(antiPath, 'utf8');
anti = anti.replace(/const HUMAN_FLOOR_MS\s*=\s*80;?/g, '');
if (!anti.includes('HUMAN_FLOOR_MS')) {
  anti = 'import { HUMAN_FLOOR_MS } from "./limits.ts";\n' + anti;
}
fs.writeFileSync(antiPath, anti);

// 3. Update scoring/validation.ts
let valPath = 'supabase/functions/_shared/scoring/validation.ts';
if (fs.existsSync(valPath)) {
  let val = fs.readFileSync(valPath, 'utf8');
  val = val.replace(/const HARD_MIN_RT_MS\s*=\s*80;?/g, '');
  val = val.replace(/HARD_MIN_RT_MS/g, 'HUMAN_FLOOR_MS');
  if (!val.includes('import { HUMAN_FLOOR_MS')) {
     val = 'import { HUMAN_FLOOR_MS } from "../limits.ts";\n' + val;
  }
  fs.writeFileSync(valPath, val);
}

// 4. Update core.ts
let corePath = 'supabase/functions/_shared/scoring/core.ts';
let core = fs.readFileSync(corePath, 'utf8');
core = core.replace(/const HUMAN_FLOOR_MS\s*=\s*80;?/g, '');
if (!core.includes('import { HUMAN_FLOOR_MS')) {
   core = 'import { HUMAN_FLOOR_MS } from "../limits.ts";\n' + core;
}
fs.writeFileSync(corePath, core);
