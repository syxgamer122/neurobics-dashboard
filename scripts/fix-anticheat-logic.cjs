const fs = require('fs');

let anticheat = fs.readFileSync('tests/anticheat.test.ts', 'utf8');

// Sudoku
anticheat = anticheat.replace(
  /it\("sudoku Master xong trong 30 giay: chi canh bao", \(\) => \{[\s\S]*?expect\(shouldReject\(r\)\)\.toBe\(false\);/g,
  `it("sudoku Master xong trong 30 giay kem timing dieu do: bi chan", () => {
    const r = inspectRound(
      "sudoku",
      {
        difficulty: "expert",
        mistakes: 0,
        placements: 51,
        moveRts: deu(51, 500),
        reEntries: 0,
        repeatMistakes: 0,
      },
      30_000,
    );
    expect(shouldReject(r)).toBe(true);`
);

// Go/No-Go
anticheat = anticheat.replace(
  /it\("gonogo uc che hoan hao: chi canh bao", \(\) => \{[\s\S]*?expect\(shouldReject\(r\)\)\.toBe\(false\);/g,
  `it("gonogo uc che hoan hao kem timing dieu do: bi chan", () => {
    const r = inspectRound(
      "gonogo",
      {
        timeMs: 60_000,
        trials: 60,
        goTrials: 45,
        nogoTrials: 15,
        hits: 45,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 15,
        rts: deu(45, 200),
      },
      60_000,
    );
    expect(shouldReject(r)).toBe(true);`
);

fs.writeFileSync('tests/anticheat.test.ts', anticheat);
console.log('Fixed anticheat test logic expectations');
