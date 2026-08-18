const fs = require('fs');

let stats = fs.readFileSync('src/app/lib/provisional-score.ts', 'utf8');

// Update BrainAgeResult type
stats = stats.replace(/age: number;\n\s+realAge: number;\n\s+\/\*\* Years younger than real age. Negative = older. \*\/\n\s+delta: number;/, 
`age: number; // backward compatibility
      ageRange: [number, number];
      realAge: number;
      /** Years younger than real age. Negative = older. */
      delta: number;`);

// Update calcBrainAge logic
stats = stats.replace(/const age = Math\.round\(Math\.max\(5, Math\.min\(120, realAge - advantage\)\)\);/g, 
`const age = Math.round(Math.max(5, Math.min(120, realAge - advantage)));
  const ageSpread = Math.max(3, Math.min(12, Math.round(120 / 20))); // just a quick heuristic since range_95 isn't here
  const ageRange: [number, number] = [Math.max(5, age - ageSpread), Math.min(120, age + ageSpread)];`);

stats = stats.replace(/age,\n\s+realAge,/g, `age,\n      ageRange,\n      realAge,`);

fs.writeFileSync('src/app/lib/provisional-score.ts', stats);
console.log('Fixed provisional-score.ts age range');
