// Bo gia lap: chay THAT scoreAndValidate + inspectRound tren nhieu kich ban.

// File nay chi dung `await import()` dong, khong co import/export tinh nao.
// Voi ES module spec, file nhu vay bi coi la SCRIPT chay o pham vi toan cuc
// chu khong phai module => top-level await bi cam, va cac bien `pass`/`fails`
// se va cham voi file sim khac. Dong `export {}` duoi day bien no thanh
// module that su. Khong doi hanh vi luc chay, chi de tsc hieu dung.
export {};

const BASE =
  "../supabase/functions/_shared/";

const { scoreAndValidate } = await import(BASE + "round-scoring.ts");
const { inspectRound, hasHardFlag, softFlags } = await import(
  BASE + "anticheat.ts"
);

// RNG deterministic de ket qua on dinh giua cac lan chay.
let seed = 12345;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
// Sinh day RT quanh gia tri trung tam voi do nhieu tu nhien (tranh bi
// anticheat coi la robot vi CV qua thap).
function rts(n: number, center: number, spread = 0.28): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(center * (1 + (rnd() - 0.5) * 2 * spread)));
  }
  return out;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

type Expect = {
  reject?: boolean;
  hardFlag?: boolean;
  softFlagContains?: string;
  check?: (s: any) => string | null; // tra ve chuoi loi, null = dat
};
type Case = {
  id: string;
  desc: string;
  game: string;
  tel: any;
  elapsed: number;
  expect: Expect;
};

const cases: Case[] = [];

// ─────────── A. VAN THAT (honest) cho ca 7 game ───────────
{
  const r = rts(25, 1400);
  cases.push({
    id: "A1",
    desc: "Schulte 5x5 thang binh thuong",
    game: "schulte",
    tel: { cells: 25, timeMs: sum(r), hitRts: r, wrongClicks: 2 },
    elapsed: sum(r) + 2000,
    expect: {
      check: (s) =>
        s.axes.speed > 100 && s.axes.spatial > 50 && !/failed/.test(s.label)
          ? null
          : `speed=${s.axes.speed} spatial=${s.axes.spatial} label=${s.label}`,
    },
  });
}
{
  const r = rts(43, 4200);
  cases.push({
    id: "A2",
    desc: "Sudoku Easy giai tron ven 43 nuoc",
    game: "sudoku",
    tel: {
      difficulty: "Easy",
      timeMs: sum(r),
      placements: 43,
      moveRts: r,
      mistakes: 0,
      reEntries: 2,
      repeatMistakes: 0,
      actualClues: 38,
    },
    elapsed: sum(r) + 3000,
    expect: {
      check: (s) =>
        s.axes.speed > 200 && s.axes.logic > 400 && s.label === "Easy"
          ? null
          : `speed=${s.axes.speed} logic=${s.axes.logic} label=${s.label}`,
    },
  });
}
{
  const r = rts(20, 1500);
  cases.push({
    id: "A3",
    desc: "Stroop lam du 20 cau, sai 0",
    game: "stroop",
    tel: { totalStimuli: 20, wrongClicks: 0, rts: r, timeMs: sum(r) + 2000 },
    elapsed: sum(r) + 4000,
    expect: {
      check: (s) =>
        s.axes.speed > 300 && s.axes.focus > 300
          ? null
          : `speed=${s.axes.speed} focus=${s.axes.focus}`,
    },
  });
}
{
  const r = rts(5, 320);
  cases.push({
    id: "A4",
    desc: "Reaction 5 lan ~320ms",
    game: "reaction",
    tel: { rts: r, falseStarts: 0, timeMs: sum(r) },
    elapsed: 20000,
    expect: {
      check: (s) => (s.axes.speed > 500 ? null : `speed=${s.axes.speed}`),
    },
  });
}
cases.push({
  id: "A5",
  desc: "Memory vuot 6 cap",
  game: "memory",
  tel: { timeMs: 42000, clearedLevels: 6, maxLevel: 6, wrongClicks: 3 },
  elapsed: 90000,
  expect: {
    check: (s) =>
      s.axes.memory > 200 && s.label === "Level 6"
        ? null
        : `memory=${s.axes.memory} label=${s.label}`,
  },
});
{
  const r = rts(18, 650);
  cases.push({
    id: "A6",
    desc: "N-Back n=2 choi tot",
    game: "nback",
    tel: {
      timeMs: 60000,
      n: 2,
      trials: 40,
      hits: 18,
      misses: 2,
      falseAlarms: 1,
      rts: r,
    },
    elapsed: 65000,
    expect: {
      check: (s) =>
        s.axes.memory > 300 && s.axes.speed !== null
          ? null
          : `memory=${s.axes.memory} speed=${s.axes.speed}`,
    },
  });
}
{
  const r = rts(20, 3600);
  cases.push({
    id: "A7",
    desc: "Math medium 18/20 dung",
    game: "math",
    tel: {
      timeMs: sum(r),
      difficulty: "medium",
      totalProblems: 20,
      correct: 18,
      wrong: 2,
      rts: r,
    },
    elapsed: sum(r) + 2000,
    expect: {
      check: (s) =>
        s.axes.logic > 400 && s.axes.speed !== null
          ? null
          : `logic=${s.axes.logic} speed=${s.axes.speed}`,
    },
  });
}

// ─────────── B. KHAI THAC: Sudoku farm Speed bang thua som ───────────
{
  const r = rts(2, 3000);
  cases.push({
    id: "B1",
    desc: "KHAI THAC Sudoku: dat 2 nuoc roi co tinh thua",
    game: "sudoku",
    tel: {
      difficulty: "Easy",
      timeMs: 10000,
      placements: 2,
      moveRts: r,
      mistakes: 3,
      reEntries: 0,
      repeatMistakes: 0,
      actualClues: 38,
    },
    elapsed: 12000,
    expect: {
      // Truoc fix: speed ~700. Sau fix: completion = 2/43 = 0.047 -> speed rat thap.
      check: (s) =>
        s.axes.speed !== null && s.axes.speed < 80
          ? null
          : `speed=${s.axes.speed} (phai < 80)`,
    },
  });
}

// ─────────── C. KHAI THAC: Stroop thoat som ───────────
{
  const r = rts(3, 700);
  cases.push({
    id: "C1",
    desc: "KHAI THAC Stroop: 3 cau nhanh roi bam sai 3 lan",
    game: "stroop",
    tel: { totalStimuli: 6, wrongClicks: 3, rts: r, timeMs: 6000 },
    elapsed: 9000,
    expect: {
      // completion = 3/20 = 0.15
      check: (s) =>
        s.axes.speed < 200 && s.axes.focus < 150
          ? null
          : `speed=${s.axes.speed} focus=${s.axes.focus} (phai thap)`,
    },
  });
}

// ─────────── D. Memory thua ngay cap 1 (truoc day bi 422 oan) ───────────
cases.push({
  id: "D1",
  desc: "Memory thua ngay cap 1, recall 900ms",
  game: "memory",
  tel: { timeMs: 900, clearedLevels: 0, maxLevel: 0, wrongClicks: 3 },
  elapsed: 15000,
  expect: {
    hardFlag: false,
    check: (s) =>
      s.axes.memory === 0 && s.label === "Level 0"
        ? null
        : `memory=${s.axes.memory} label=${s.label}`,
  },
});
cases.push({
  id: "D2",
  desc: "Memory vuot 1 cap roi thua, recall 1100ms",
  game: "memory",
  tel: { timeMs: 1100, clearedLevels: 1, maxLevel: 1, wrongClicks: 3 },
  elapsed: 20000,
  expect: { hardFlag: false },
});
cases.push({
  id: "D3",
  desc: "Memory 8 cap nhung recall chi 2s (that su phi ly)",
  game: "memory",
  tel: { timeMs: 2000, clearedLevels: 8, maxLevel: 8, wrongClicks: 0 },
  elapsed: 30000,
  expect: { hardFlag: true },
});

// ─────────── E. San RT: 80-120ms chi soft, duoi 80 moi tu choi ───────────
{
  const r = [100, 305, 340, 298, 361];
  cases.push({
    id: "E1",
    desc: "Reaction co 1 mau 100ms (bam du doan)",
    game: "reaction",
    tel: { rts: r, falseStarts: 0, timeMs: sum(r) },
    elapsed: 20000,
    expect: {
      reject: false,
      hardFlag: false,
      check: (s) => (s.axes.speed > 400 ? null : `speed=${s.axes.speed}`),
    },
  });
}
{
  const r = [95, 101, 88, 110, 99];
  cases.push({
    id: "E2",
    desc: "Reaction TAT CA mau trong 80-120ms (dang bot)",
    game: "reaction",
    tel: { rts: r, falseStarts: 0, timeMs: sum(r) },
    elapsed: 20000,
    expect: { reject: false, softFlagContains: "120ms" },
  });
}
{
  const r = [45, 310, 330, 300, 350];
  cases.push({
    id: "E3",
    desc: "Reaction co mau 45ms (duoi san cung 80ms)",
    game: "reaction",
    tel: { rts: r, falseStarts: 0, timeMs: sum(r) },
    elapsed: 20000,
    expect: { reject: true },
  });
}
{
  const r = [110, 640, 700, 660, 690, 620, 710, 650];
  cases.push({
    id: "E4",
    desc: "N-Back co 1 mau 110ms",
    game: "nback",
    tel: {
      timeMs: 40000,
      n: 2,
      trials: 30,
      hits: 12,
      misses: 2,
      falseAlarms: 1,
      rts: r,
    },
    elapsed: 45000,
    expect: { reject: false },
  });
}
{
  const r = [115, 1500, 1400, 1600, 1450];
  cases.push({
    id: "E5",
    desc: "Stroop co 1 mau 115ms",
    game: "stroop",
    tel: { totalStimuli: 20, wrongClicks: 1, rts: r, timeMs: 12000 },
    elapsed: 15000,
    expect: { reject: false },
  });
}

// ─────────── F. Schulte van thua ───────────
{
  const r = rts(9, 1600);
  cases.push({
    id: "F1",
    desc: "Schulte 5x5 thua giua chung (tim duoc 9/25)",
    game: "schulte",
    tel: {
      cells: 25,
      timeMs: sum(r),
      hitRts: r,
      wrongClicks: 5,
      failed: true,
      intendedCells: 25,
    },
    elapsed: sum(r) + 3000,
    expect: {
      reject: false,
      check: (s) =>
        /\(failed\)/.test(s.label)
          ? null
          : `label="${s.label}" thieu hau to (failed)`,
    },
  });
}
cases.push({
  id: "F2",
  desc: "Schulte thua ngay, khong tim duoc o nao",
  game: "schulte",
  tel: {
    cells: 25,
    timeMs: 3000,
    hitRts: [],
    wrongClicks: 4,
    failed: true,
  },
  elapsed: 10000,
  expect: {
    reject: false,
    check: (s) =>
      s.axes.speed === null && s.headline === 0
        ? null
        : `speed=${s.axes.speed} headline=${s.headline}`,
  },
});

// ─────────── G. Kich ban bien / gia mao khac ───────────
cases.push({
  id: "G1",
  desc: "Sudoku Extreme khai bao nhung de that 38 clue",
  game: "sudoku",
  tel: {
    difficulty: "Extreme",
    timeMs: 300000,
    placements: 43,
    moveRts: rts(43, 6500),
    mistakes: 0,
    reEntries: 0,
    repeatMistakes: 0,
    actualClues: 38,
  },
  elapsed: 305000,
  expect: {
    // effectiveSudokuDiff phai ha he so ve muc Easy (0.5)
    check: (s) =>
      s.axes.logic <= 520
        ? null
        : `logic=${s.axes.logic} — he so kho chua bi ha`,
  },
});
cases.push({
  id: "G2",
  desc: "Sudoku van dai 1h55 (kiem tra tran 2h)",
  game: "sudoku",
  tel: {
    difficulty: "Extreme",
    timeMs: 6_900_000,
    placements: 58,
    moveRts: rts(58, 100000),
    mistakes: 1,
    reEntries: 3,
    repeatMistakes: 1,
    actualClues: 23,
  },
  elapsed: 6_905_000,
  expect: { reject: false },
});
cases.push({
  id: "G3",
  desc: "Stroop bao rts nhieu hon so stimulus",
  game: "stroop",
  tel: { totalStimuli: 5, wrongClicks: 0, rts: rts(9, 800), timeMs: 8000 },
  elapsed: 10000,
  expect: { reject: true },
});
cases.push({
  id: "G4",
  desc: "Math bao 30 dung tren 20 cau",
  game: "math",
  tel: {
    timeMs: 60000,
    difficulty: "hard",
    totalProblems: 20,
    correct: 30,
    wrong: 0,
    rts: rts(30, 2000),
  },
  elapsed: 65000,
  expect: { reject: true },
});
cases.push({
  id: "G5",
  desc: "Tong RT vuot thoi gian van",
  game: "reaction",
  tel: { rts: [9000, 9000, 9000, 9000, 9000], falseStarts: 0, timeMs: 45000 },
  elapsed: 3000,
  expect: { reject: true },
});
cases.push({
  id: "G6",
  desc: "Memory client CU (chi co maxLevel, khong co clearedLevels)",
  game: "memory",
  tel: { timeMs: 40000, maxLevel: 5, wrongClicks: 2 },
  elapsed: 60000,
  expect: {
    reject: false,
    check: (s) =>
      s.axes.memory > 100 ? null : `memory=${s.axes.memory}`,
  },
});
cases.push({
  id: "G7",
  desc: "Reaction bot deu tam tap (CV cuc thap) -> soft flag, KHONG hard",
  game: "reaction",
  tel: {
    rts: [200, 201, 200, 199, 200],
    falseStarts: 0,
    timeMs: 1000,
  },
  elapsed: 20000,
  // Chu y: co y KHONG hard-flag. Nhip do qua deu chi la nghi ngo, nguoi that
  // luyen nhieu cung ra CV thap. Chinh sach da chot: "tha lot con hon bat oan"
  // => chi gan soft flag de review, khong tu dong chan van dau.
  expect: {
    hardFlag: false,
    softFlagContains: "metronomic",
  },
});

// ─────────── Chay ───────────
let pass = 0;
const fails: string[] = [];

for (const c of cases) {
  let scored: any = null;
  let err: string | null = null;
  try {
    scored = scoreAndValidate(c.game, c.tel, c.elapsed);
  } catch (e: any) {
    err = String(e?.message ?? e);
  }

  const problems: string[] = [];

  if (c.expect.reject === true) {
    if (!err) problems.push("MONG DOI bi tu choi nhung lai duoc chap nhan");
  } else {
    if (err) problems.push(`bi tu choi ngoai y muon: ${err}`);
  }

  let report: any = null;
  if (!err) {
    try {
      report = inspectRound(c.game, c.tel, c.elapsed);
    } catch (e: any) {
      problems.push(`inspectRound nem loi: ${e?.message ?? e}`);
    }
  }

  if (report) {
    const hard = hasHardFlag(report);
    if (c.expect.hardFlag === true && !hard)
      problems.push("MONG DOI hard flag nhung khong co");
    if (c.expect.hardFlag === false && hard)
      problems.push(
        `hard flag ngoai y muon: ${report.flags
          .filter((f: any) => f.severity === "hard")
          .map((f: any) => f.msg)
          .join("; ")}`,
      );
    if (c.expect.softFlagContains) {
      const found = softFlags(report).some((f: any) =>
        f.msg.includes(c.expect.softFlagContains!),
      );
      if (!found)
        problems.push(
          `thieu soft flag chua "${c.expect.softFlagContains}" (co: ${softFlags(
            report,
          )
            .map((f: any) => f.msg)
            .join("; ") || "khong co"})`,
        );
    }
  }

  if (!err && c.expect.check) {
    const msg = c.expect.check(scored);
    if (msg) problems.push(msg);
  }

  const axesStr = scored
    ? Object.entries(scored.axes)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "-";
  const flagStr = report
    ? report.flags.map((f: any) => `[${f.severity}] ${f.msg}`).join(" | ") ||
      "sach"
    : "-";

  if (problems.length === 0) {
    pass++;
    console.log(`PASS ${c.id}  ${c.desc}`);
    console.log(`       ${axesStr}${scored ? `  headline=${scored.headline}` : ""}`);
    if (report && report.flags.length) console.log(`       flags: ${flagStr}`);
  } else {
    fails.push(`${c.id} ${c.desc}`);
    console.log(`FAIL ${c.id}  ${c.desc}`);
    for (const p of problems) console.log(`       -> ${p}`);
    console.log(`       ${axesStr}`);
    if (report && report.flags.length) console.log(`       flags: ${flagStr}`);
  }
}

console.log("\n==================================================");
console.log(`TONG: ${pass}/${cases.length} dat`);
if (fails.length) {
  console.log("THAT BAI:");
  for (const f of fails) console.log("  - " + f);
}
