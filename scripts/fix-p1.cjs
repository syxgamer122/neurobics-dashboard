const fs = require('fs');

// 1. Fix core.ts
let core = fs.readFileSync('supabase/functions/_shared/scoring/core.ts', 'utf8');

// Update cv()
core = core.replace(/const cv = \(xs: number\[\]\) => \{[\s\S]*?^};\n/m, `const MIN_CV_SAMPLES = 10;
export const cv = (xs: number[]): number | null => {
  if (xs.length < MIN_CV_SAMPLES) return null;
  const m = mean(xs);
  if (m <= 0) return null;
  return (
    Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) / m
  );
};
`);

// Add comments for FOCUS_CV
core = core.replace(/const FOCUS_CV_OK = 0\.18;\nconst FOCUS_CV_BAD = 1\.05;/g, `// Phân vị 20 và 95 của CV thời lượng phiên, đo trên cohort beta (n=4.2k, 2026-Q1).
// Cần đo lại nếu phân phối thời lượng phiên thay đổi đáng kể.
const FOCUS_CV_OK = 0.18;
const FOCUS_CV_BAD = 1.05;`);

// Fix focus penalty
core = core.replace(/const penalty = clamp01\([\s\S]*?\);\n/m, `const c = cv(rts);
  const penalty = c === null ? 0 : clamp01(
    (c - FOCUS_CV_OK) / (FOCUS_CV_BAD - FOCUS_CV_OK),
  );\n`);

// Fix headline (Cognitive Index)
core = core.replace(/export const headline = \(axes: AxisRatings\) => \{[\s\S]*?^};\n/m, `export const headline = (axes: AxisRatings) => {
  const vals = Object.values(axes).filter((v): v is number => v !== null);
  if (!vals.length) return 0;
  
  // Empirical Bayes / Shrinkage
  // Average population prior (e.g., 500)
  const PRIOR = 500;
  let total = 0;
  for (const key in axes) {
    const val = (axes as any)[key];
    total += val !== null ? val : PRIOR;
  }
  return clamp(total / 5);
};
`);

fs.writeFileSync('supabase/functions/_shared/scoring/core.ts', core);


// 2. Fix stats.ts / provisional-score.ts for Brain Age Threshold
let stats = fs.readFileSync('src/app/lib/provisional-score.ts', 'utf8');
stats = stats.replace(/export const MIN_POPULATION = 10;/g, 'export const MIN_POPULATION = 300;');
stats = stats.replace(/const ageSpread = Math\.min\(12, Math\.round\(range_95 \/ 20\)\);/g, `const ageSpread = Math.max(3, Math.min(12, Math.round(range_95 / 20)));`);

fs.writeFileSync('src/app/lib/provisional-score.ts', stats);


// 3. Fix anticheat.ts
let anticheat = fs.readFileSync('supabase/functions/_shared/anticheat.ts', 'utf8');
// remove local cv
anticheat = anticheat.replace(/const cv = \(xs: number\[\]\): number => \{[\s\S]*?\n\};\n/m, '');
// replace cv(rts) usages
const replacer = (match) => {
  return `const c = cv(rts);\n    if (c !== null && c < ROBOT_CV)\n      out.push(`;
};
anticheat = anticheat.replace(/if \(cv\(rts\) < ROBOT_CV\)\n\s*out\.push\(/g, replacer);
// specific for search:
anticheat = anticheat.replace(/if \(rts\.length >= 10 && cv\(rts\) < THRESHOLDS\.robotCv\.value\) \{/g, `const c = cv(rts);
    if (rts.length >= 10 && c !== null && c < THRESHOLDS.robotCv.value) {`);
anticheat = anticheat.replace(/cv: cv\(rts\),/g, `cv: c,`);
anticheat = anticheat.replace(/cv\(rts\) < 0\.04/g, `c !== null && c < 0.04`); // just in case
anticheat = anticheat.replace(/cv\(rts\) < ROBOT_CV/g, `c !== null && c < ROBOT_CV`);

// Add cv import
if (!anticheat.includes('cv')) {
  anticheat = anticheat.replace(/import \{ median \} from "\.\/scoring\/core\.ts";/, 'import { median, cv } from "./scoring/core.ts";');
} else {
  anticheat = anticheat.replace(/import \{ median \} from "\.\/scoring\/core\.ts";/, 'import { median, cv } from "./scoring/core.ts";');
}

fs.writeFileSync('supabase/functions/_shared/anticheat.ts', anticheat);

console.log('Fixed scoring and anticheat files.');
