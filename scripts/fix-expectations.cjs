const fs = require('fs');

let anticheat = fs.readFileSync('tests/anticheat.test.ts', 'utf8');

anticheat = anticheat.replace(/expect\(shouldReject\(r\)\)\.toBe\(false\);\n\s+expect\(msgs\(r\)\)\.toEqual\(\[\n\s+"Sudoku timing too metronomic"/, 
`expect(shouldReject(r)).toBe(true);
    expect(msgs(r)).toEqual([
      "Sudoku timing too metronomic"`);

anticheat = anticheat.replace(/expect\(shouldReject\(r\)\)\.toBe\(false\);\n\s+expect\(msgs\(r\)\)\.toContain\("Perfect inhibition with very fast Go RTs"\);/g, 
`expect(shouldReject(r)).toBe(true);
    expect(msgs(r)).toContain("Perfect inhibition with very fast Go RTs");`);

fs.writeFileSync('tests/anticheat.test.ts', anticheat);
console.log('Fixed expectations back to true');
