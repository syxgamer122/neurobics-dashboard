const fs = require('fs');

let testCode = `
import { cv } from "../supabase/functions/_shared/scoring/core";

describe("Boundary tests for cv()", () => {
  it("returns null for empty lists", () => {
    expect(cv([])).toBeNull();
  });

  it("returns null for n < 10", () => {
    expect(cv([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });

  it("returns 0 if all elements are identical", () => {
    // 10 identical elements
    const arr = Array(10).fill(250);
    expect(cv(arr)).toBe(0);
  });

  it("handles outliers but keeps CV within reason", () => {
    const arr = Array(9).fill(250).concat([5000]);
    const val = cv(arr);
    expect(val).toBeGreaterThan(0.5);
  });
});
`;

fs.appendFileSync('tests/scoring-stats.test.ts', testCode);
console.log('Added tests to scoring-stats.test.ts');
