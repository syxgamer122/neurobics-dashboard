const fs = require('fs');

let tests = fs.readFileSync('tests/scoring.test.ts', 'utf8');
if (!tests.includes('math logic axis is time-independent')) {
  tests += `\n
test("math logic axis is time-independent", async () => {
  const { scoreMath } = await import("../supabase/functions/_shared/scoring/standard-games.ts");
  const fast = scoreMath({ correct: 20, wrong: 0, totalProblems: 20, rts: Array(20).fill(800) });
  const slow = scoreMath({ correct: 20, wrong: 0, totalProblems: 20, rts: Array(20).fill(3000) });
  expect(fast.axes.logic).toBe(slow.axes.logic);
  expect(fast.axes.speed).toBeGreaterThan(slow.axes.speed);
});
`;
  fs.writeFileSync('tests/scoring.test.ts', tests);
}

// Rename computeProvisionalRoundResult -> estimateRoundResult in docs and src/app/lib/provisional-score.ts
let provPath = 'src/app/lib/provisional-score.ts';
if (fs.existsSync(provPath)) {
  let prov = fs.readFileSync(provPath, 'utf8');
  prov = prov.replace(/computeProvisionalRoundResult/g, 'estimateRoundResult');
  fs.writeFileSync(provPath, prov);
}

// Update imports
let hookPath = 'src/app/hooks/use-round-submission.ts';
if (fs.existsSync(hookPath)) {
  let hook = fs.readFileSync(hookPath, 'utf8');
  hook = hook.replace(/computeProvisionalRoundResult/g, 'estimateRoundResult');
  fs.writeFileSync(hookPath, hook);
}
