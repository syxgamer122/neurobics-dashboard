const fs = require('fs');

let anticheat = fs.readFileSync('supabase/functions/_shared/anticheat.ts', 'utf8');

anticheat = anticheat.replace(/if \(c !== null && c < ROBOT_CV\)/g, 'const c = cv(rts);\n  if (c !== null && c < ROBOT_CV)');
anticheat = anticheat.replace(/cv: cv\(rts\)/g, 'cv: c');

fs.writeFileSync('supabase/functions/_shared/anticheat.ts', anticheat);
console.log('Fixed anticheat cv issues');
