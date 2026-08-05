// Bo HIEU CHUAN: chay ca 11 game o 3 muc trinh do voi telemetry hop ly, roi
// so sanh diem CUNG MOT TRUC giua cac game de tra loi 2 cau hoi:
//   1. Cac truc co DONG BO khong (choi ngang trinh do o 2 game => diem ngang)?
//   2. Diem co RE QUA khong (nguoi yeu da duoc diem cao, nguoi manh bao hoa)?
// Chay: node --experimental-strip-types tests/sim-calibration.ts
export {};

const BASE = "../supabase/functions/_shared/";
const { scoreAndValidate } = await import(BASE + "round-scoring.ts");

// RNG tien dinh de ket qua lap lai duoc giua cac lan chay.
let seed = 987654321;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// Nguoi that khong bam deu nhu may. CV cao hon = choi that thuong hon.
function rts(n: number, center: number, spread: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = center * (1 + (rnd() * 2 - 1) * spread);
    out.push(Math.max(90, Math.round(v)));
  }
  return out;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

type TierId = "YEU" | "TB" | "MANH";
const TIER_LABEL: Record<TierId, string> = {
  YEU: "yeu",
  TB: "trung binh",
  MANH: "manh",
};
// Nguoi yeu co nhip bam that thuong hon nguoi manh — anh huong that den Focus.
const SPREAD: Record<TierId, number> = { YEU: 0.38, TB: 0.28, MANH: 0.2 };

type Trial = { game: string; tier: TierId; tel: any };
const trials: Trial[] = [];
const add = (t: Trial) => trials.push(t);

// ─────────── 1. Schulte 5x5 (target 2600ms/o) ───────────
function schulte(tier: TierId, perMs: number, wrong: number): Trial {
  // Phan tu dau ~90ms la moc khoi dong: dong ho chay tu cu click dau tien.
  const hits = [90, ...rts(24, perMs, SPREAD[tier])];
  return {
    game: "schulte",
    tier,
    tel: { cells: 25, timeMs: sum(hits), hitRts: hits, wrongClicks: wrong },
  };
}
add(schulte("YEU", 4000, 7));
add(schulte("TB", 2400, 3));
add(schulte("MANH", 1280, 0));

// ─────────── 2. Sudoku Medium (36 clue, ky vong 45 nuoc) ───────────
function sudoku(
  tier: TierId,
  perMs: number,
  mistakes: number,
  reEntries: number,
  repeat: number,
): Trial {
  const placements = 45;
  const moves = [90, ...rts(placements - 1, perMs, SPREAD[tier])];
  return {
    game: "sudoku",
    tier,
    tel: {
      difficulty: "Medium",
      actualClues: 36,
      timeMs: sum(moves),
      placements,
      moveRts: moves,
      mistakes,
      reEntries,
      repeatMistakes: repeat,
    },
  };
}
add(sudoku("YEU", 9000, 2, 8, 3));
add(sudoku("TB", 6200, 1, 2, 0));
add(sudoku("MANH", 4000, 0, 0, 0));

// ─────────── 3. Stroop 30 cau (target 1400ms) ───────────
function stroop(tier: TierId, perMs: number, wrong: number): Trial {
  const answered = 30 - wrong;
  const r = [90, ...rts(answered - 1, perMs, SPREAD[tier])];
  return {
    game: "stroop",
    tier,
    tel: {
      totalStimuli: 30,
      wrongClicks: wrong,
      rts: r,
      timeMs: sum(r) + wrong * perMs,
    },
  };
}
add(stroop("YEU", 1900, 6));
add(stroop("TB", 1350, 3));
add(stroop("MANH", 950, 0));

// ─────────── 4. Reaction 10 mau (target 280ms) ───────────
function reaction(tier: TierId, med: number, falseStarts: number): Trial {
  const r = rts(10, med, SPREAD[tier] * 0.6);
  return {
    game: "reaction",
    tier,
    tel: { rts: r, falseStarts, timeMs: sum(r) + 8000 },
  };
}
add(reaction("YEU", 420, 2));
add(reaction("TB", 320, 1));
add(reaction("MANH", 240, 0));

// ─────────── 5. Memory (full o level 16) ───────────
function memory(tier: TierId, level: number, wrong: number): Trial {
  return {
    game: "memory",
    tier,
    tel: {
      clearedLevels: level,
      wrongClicks: wrong,
      timeMs: 20000 + level * 6000,
    },
  };
}
add(memory("YEU", 3, 4));
add(memory("TB", 7, 2));
add(memory("MANH", 13, 0));

// ─────────── 6. Math Sprint medium (target 3400ms) ───────────
function math(
  tier: TierId,
  perMs: number,
  correct: number,
  wrong: number,
): Trial {
  const r = rts(correct + wrong, perMs, SPREAD[tier]);
  return {
    game: "math",
    tier,
    tel: {
      difficulty: "medium",
      totalProblems: 20,
      correct,
      wrong,
      rts: r,
      timeMs: sum(r) + 2000,
    },
  };
}
add(math("YEU", 5200, 11, 9));
add(math("TB", 3300, 16, 4));
add(math("MANH", 2200, 20, 0));

// ─────────── 7. N-Back 40 trial ───────────
function nback(
  tier: TierId,
  n: number,
  hits: number,
  misses: number,
  fa: number,
  perMs: number,
): Trial {
  const r = rts(hits, perMs, SPREAD[tier]);
  return {
    game: "nback",
    tier,
    tel: {
      timeMs: 90000,
      n,
      trials: 40,
      hits,
      misses,
      falseAlarms: fa,
      rts: r,
    },
  };
}
add(nback("YEU", 2, 6, 6, 5, 900));
add(nback("TB", 2, 10, 2, 2, 720));
add(nback("MANH", 3, 12, 0, 0, 600));

// ─────────── 8. Go/No-Go 40 trial (28 GO / 12 NOGO) ───────────
function gonogo(
  tier: TierId,
  hits: number,
  misses: number,
  fa: number,
  cr: number,
  perMs: number,
): Trial {
  const r = rts(hits, perMs, SPREAD[tier] * 0.7);
  return {
    game: "gonogo",
    tier,
    tel: {
      timeMs: 95000,
      trials: 40,
      goTrials: hits + misses,
      nogoTrials: fa + cr,
      hits,
      misses,
      falseAlarms: fa,
      correctRejections: cr,
      rts: r,
    },
  };
}
add(gonogo("YEU", 24, 4, 6, 6, 480));
add(gonogo("TB", 27, 1, 2, 10, 400));
add(gonogo("MANH", 28, 0, 0, 12, 330));

// ─────────── 9. Mental Rotation 24 trial ───────────
function mental(tier: TierId, correct: number, perMs: number): Trial {
  const trialCount = 24;
  const r = rts(trialCount, perMs, SPREAD[tier]);
  const angles: number[] = [];
  const deck = [0, 45, 90, 135, 180, 225, 270, 315];
  for (let i = 0; i < trialCount; i++) angles.push(deck[i % 8]);
  return {
    game: "mental",
    tier,
    tel: {
      timeMs: sum(r) + 4000,
      trials: trialCount,
      correct,
      wrong: trialCount - correct,
      rts: r,
      angles,
    },
  };
}
add(mental("YEU", 14, 2600));
add(mental("TB", 19, 1500));
add(mental("MANH", 24, 1050));

// ─────────── 10. Corsi Block ───────────
function corsi(
  tier: TierId,
  span: number,
  trialCount: number,
  correctTrials: number,
  taps: number,
  wrong: number,
  perMs: number,
): Trial {
  const r = rts(taps, perMs, SPREAD[tier]);
  return {
    game: "corsi",
    tier,
    // timeMs gom ca pha chieu chuoi (khong nam trong rts) — dung nhu client.
    tel: {
      timeMs: sum(r) + trialCount * 3000,
      span,
      trials: trialCount,
      correctTrials,
      taps,
      wrongClicks: wrong,
      rts: r,
    },
  };
}
add(corsi("YEU", 3, 6, 2, 12, 4, 900));
add(corsi("TB", 5, 9, 5, 26, 4, 700));
add(corsi("MANH", 8, 12, 9, 54, 3, 650));

// ─────────── 11. Trail Making B 24 diem ───────────
function trail(tier: TierId, wrong: number, perMs: number): Trial {
  const nodes = 24;
  const r = rts(nodes - 1, perMs, SPREAD[tier]);
  return {
    game: "trail",
    tier,
    tel: { timeMs: sum(r), nodes, mode: "B", wrongClicks: wrong, rts: r },
  };
}
add(trail("YEU", 6, 1900));
add(trail("TB", 2, 1150));
add(trail("MANH", 0, 780));

// ─────────── Chay va thu ket qua ───────────
const AXES = ["speed", "focus", "spatial", "logic", "memory"] as const;

type Row = {
  game: string;
  tier: TierId;
  axes: Record<string, number | null>;
  headline: number;
  label: string;
};
const rows: Row[] = [];
const errors: string[] = [];

for (const t of trials) {
  const rtsLen = Array.isArray(t.tel.rts) ? sum(t.tel.rts) : 0;
  const moveLen = Array.isArray(t.tel.moveRts) ? sum(t.tel.moveRts) : 0;
  const hitLen = Array.isArray(t.tel.hitRts) ? sum(t.tel.hitRts) : 0;
  const elapsed = Math.min(
    7_200_000,
    Math.max(t.tel.timeMs, rtsLen, moveLen, hitLen) + 20000,
  );
  try {
    const s = scoreAndValidate(t.game as any, t.tel, elapsed);
    rows.push({
      game: t.game,
      tier: t.tier,
      axes: s.axes,
      headline: s.headline,
      label: s.label,
    });
  } catch (e) {
    errors.push(`${t.game}/${t.tier}: ${(e as Error).message}`);
  }
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const padL = (s: string | number, n: number) => String(s).padStart(n);
const cell = (v: number | null) => (v === null ? "  ·" : padL(v, 4));

console.log("\n===== 1. BANG DIEM 11 GAME x 3 MUC TRINH DO =====\n");
console.log(
  pad("game", 10) +
    pad("muc", 12) +
    AXES.map((a) => padL(a.slice(0, 5), 6)).join("") +
    padL("TONG", 7) +
    "   nhan",
);
console.log("-".repeat(78));
let lastGame = "";
for (const r of rows) {
  if (lastGame && r.game !== lastGame) console.log("");
  lastGame = r.game;
  console.log(
    pad(r.game, 10) +
      pad(TIER_LABEL[r.tier], 12) +
      AXES.map((a) => padL(cell(r.axes[a]), 6)).join("") +
      padL(r.headline, 7) +
      "   " +
      r.label,
  );
}

if (errors.length) {
  console.log("\n!! CO VAN BI TU CHOI (telemetry mo phong sai) !!");
  for (const e of errors) console.log("   " + e);
}

// ─────────── 2. Do DONG BO tung truc ───────────
console.log("\n\n===== 2. DO DONG BO: cung mot truc, cung trinh do =====");
console.log("Neu he thong dong bo, cac game do CUNG mot truc phai cho diem");
console.log("gan nhau khi nguoi choi o cung trinh do.\n");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const syncIssues: string[] = [];
for (const axis of AXES) {
  const games = rows.filter((r) => r.axes[axis] !== null).map((r) => r.game);
  const uniqueGames = [...new Set(games)];
  if (uniqueGames.length < 2) continue;
  console.log(`--- ${axis.toUpperCase()}  (${uniqueGames.length} game) ---`);
  for (const tier of ["YEU", "TB", "MANH"] as TierId[]) {
    const pts = rows
      .filter((r) => r.tier === tier && r.axes[axis] !== null)
      .map((r) => ({ game: r.game, v: r.axes[axis] as number }))
      .sort((a, b) => a.v - b.v);
    if (pts.length < 2) continue;
    const vals = pts.map((p) => p.v);
    const spread = vals[vals.length - 1] - vals[0];
    const med = median(vals);
    const tag =
      spread > 350
        ? "  <== LECH RAT RONG"
        : spread > 250
          ? "  <== lech rong"
          : "";
    console.log(
      `  ${pad(TIER_LABEL[tier], 11)} trung vi ${padL(med, 4)}` +
        `   bien do ${padL(spread, 4)}${tag}`,
    );
    console.log("      " + pts.map((p) => `${p.game}=${p.v}`).join("  "));
    if (spread > 250) {
      syncIssues.push(
        `${axis} @ ${TIER_LABEL[tier]}: bien do ${spread} ` +
          `(${pts[0].game}=${pts[0].v} ... ${pts[pts.length - 1].game}=${pts[pts.length - 1].v})`,
      );
    }
  }
  console.log("");
}

// ─────────── 3. Co RE QUA khong ───────────
console.log("\n===== 3. DIEM CO RE QUA KHONG =====\n");

const cheap: string[] = [];
const harsh: string[] = [];
const saturated: string[] = [];

for (const r of rows) {
  const active = AXES.map((a) => r.axes[a]).filter(
    (v): v is number => v !== null,
  );
  if (r.tier === "YEU" && r.headline >= 500)
    cheap.push(`${r.game}: nguoi YEU da duoc ${r.headline}`);
  if (r.tier === "MANH" && r.headline < 600)
    harsh.push(`${r.game}: nguoi MANH chi duoc ${r.headline}`);
  for (const a of AXES) {
    const v = r.axes[a];
    if (v === 1000)
      saturated.push(`${r.game}/${TIER_LABEL[r.tier]}: ${a} = 1000 (bao hoa)`);
  }
  void active;
}

const tierMean = (tier: TierId) => {
  const xs = rows.filter((r) => r.tier === tier).map((r) => r.headline);
  return Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
};
console.log("Diem tong hop trung binh theo trinh do:");
console.log(`   yeu        ${padL(tierMean("YEU"), 4)}  / 1000`);
console.log(`   trung binh ${padL(tierMean("TB"), 4)}  / 1000`);
console.log(`   manh       ${padL(tierMean("MANH"), 4)}  / 1000`);
console.log(
  `   khoang cach yeu -> manh: ${tierMean("MANH") - tierMean("YEU")} diem`,
);

console.log("\n[A] SAN QUA CAO (nguoi yeu da >= 500):");
if (cheap.length) for (const c of cheap) console.log("   " + c);
else console.log("   khong co");

console.log("\n[B] TRAN BAO HOA (cham dung 1000, mat kha nang phan biet):");
if (saturated.length) for (const c of saturated) console.log("   " + c);
else console.log("   khong co");

console.log("\n[C] QUA KHAT (nguoi manh < 600):");
if (harsh.length) for (const c of harsh) console.log("   " + c);
else console.log("   khong co");

console.log("\n[D] LECH DONG BO GIUA CAC GAME (bien do > 250):");
if (syncIssues.length) for (const c of syncIssues) console.log("   " + c);
else console.log("   khong co");

// ─────────── 4. Tran ly thuyet tung game ───────────
console.log("\n\n===== 4. TRAN LY THUYET (choi hoan hao tuyet doi) =====");
console.log("Cho biet moi game toi da cho bao nhieu diem moi truc.\n");

const ceilingTrials: Trial[] = [
  schulte("MANH", 900, 0),
  sudoku("MANH", 2600, 0, 0, 0),
  stroop("MANH", 700, 0),
  reaction("MANH", 180, 0),
  memory("MANH", 16, 0),
  math("MANH", 1500, 20, 0),
  nback("MANH", 6, 12, 0, 0, 400),
  gonogo("MANH", 28, 0, 0, 12, 250),
  mental("MANH", 24, 900),
  corsi("MANH", 9, 12, 12, 60, 0, 500),
  trail("MANH", 0, 600),
];
console.log(
  pad("game", 10) +
    AXES.map((a) => padL(a.slice(0, 5), 6)).join("") +
    padL("TONG", 7),
);
console.log("-".repeat(48));
for (const t of ceilingTrials) {
  const rtsLen = Array.isArray(t.tel.rts) ? sum(t.tel.rts) : 0;
  const moveLen = Array.isArray(t.tel.moveRts) ? sum(t.tel.moveRts) : 0;
  const hitLen = Array.isArray(t.tel.hitRts) ? sum(t.tel.hitRts) : 0;
  const elapsed = Math.min(
    7_200_000,
    Math.max(t.tel.timeMs, rtsLen, moveLen, hitLen) + 20000,
  );
  try {
    const s = scoreAndValidate(t.game as any, t.tel, elapsed);
    console.log(
      pad(t.game, 10) +
        AXES.map((a) => padL(cell(s.axes[a]), 6)).join("") +
        padL(s.headline, 7),
    );
  } catch (e) {
    console.log(pad(t.game, 10) + "  LOI: " + (e as Error).message);
  }
}

console.log("\n" + "=".repeat(60));
console.log(
  `Da cham ${rows.length}/${trials.length} van mo phong, ${errors.length} van bi tu choi.`,
);
