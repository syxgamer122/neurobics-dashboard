// Bo gia lap bo sung: phu cac module chua co test nao cham toi.
// Chay: node --experimental-strip-types tests/sim-audit.ts

import {
  xpRequiredForLevel,
  levelFromXp,
  getLevelProgress,
  getLevelTitle,
  calculateRoundXp,
  MAX_XP_PER_ROUND,
} from "../src/app/lib/xp.ts";
import { SESSION_COLUMNS, totalSessions } from "../src/app/lib/sessions.ts";
import {
  GAME_BY_ID,
  GAME_IDS,
  GAME_REGISTRY,
  isGameId,
} from "../src/app/lib/game-registry.ts";
import {
  GAME_IDS as SERVER_GAME_IDS,
  isGame as isServerGame,
} from "../supabase/functions/_shared/scoring/core.ts";
import { vi } from "../src/app/lib/i18n/vi.ts";
import { en } from "../src/app/lib/i18n/en.ts";
import { AXIS_COLUMNS, AXIS_META } from "../src/app/lib/axes.ts";
import { generateSudoku, countSolutions } from "../src/app/lib/sudoku-gen.ts";

let pass = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log("PASS " + name);
  } else {
    fails.push(name + (detail ? "  -> " + detail : ""));
    console.log("FAIL " + name + (detail ? "  -> " + detail : ""));
  }
}

function section(s: string) {
  console.log("\n===== " + s + " =====");
}

// ---------------------------------------------------------------- XP / LEVEL
section("xp.ts: level <-> xp nhat quan");

let monotonicOk = true;
let roundTripOk = true;
let boundaryOk = true;
let prevLevel = levelFromXp(0);
for (let xp = 0; xp <= 3_000_000; xp += 137) {
  const lv = levelFromXp(xp);
  if (lv < prevLevel) {
    monotonicOk = false;
    break;
  }
  prevLevel = lv;
}
check("levelFromXp khong bao gio giam khi xp tang", monotonicOk);

for (let lv = 1; lv <= 2000; lv++) {
  const need = xpRequiredForLevel(lv);
  if (levelFromXp(need) !== lv) {
    roundTripOk = false;
    fails.push(
      "  chi tiet: level " +
        lv +
        " nguong " +
        need +
        " -> " +
        levelFromXp(need),
    );
    break;
  }
  // ngay truoc nguong phai la level truoc do
  if (lv > 1 && levelFromXp(need - 1) !== lv - 1) {
    boundaryOk = false;
    fails.push(
      "  chi tiet: xp " +
        (need - 1) +
        " -> " +
        levelFromXp(need - 1) +
        " (mong " +
        (lv - 1) +
        ")",
    );
    break;
  }
}
check("xpRequiredForLevel(L) -> levelFromXp tra dung L (1..2000)", roundTripOk);
check("xp ngay truoc nguong roi ve level truoc (khong off-by-one)", boundaryOk);

check("levelFromXp(0) = 1", levelFromXp(0) === 1, String(levelFromXp(0)));
check(
  "xp am khong lam vo",
  levelFromXp(-5000) === 1,
  String(levelFromXp(-5000)),
);
check(
  "XP_MAX 200tr -> level ~2000",
  levelFromXp(200_000_000) >= 1990 && levelFromXp(200_000_000) <= 2010,
  String(levelFromXp(200_000_000)),
);
check(
  "su co cu: xp 1e14 tung ra level 1.414.214",
  levelFromXp(1e14) > 1_000_000,
  String(levelFromXp(1e14)),
);

section("xp.ts: getLevelProgress");
let progressOk = true;
let progressDetail = "";
for (let xp = 0; xp <= 500_000; xp += 991) {
  const p = getLevelProgress(xp);
  if (p.progress < 0 || p.progress >= 1.0000001) {
    progressOk = false;
    progressDetail = "xp " + xp + " progress " + p.progress;
    break;
  }
  if (p.xpIntoLevel < 0 || p.xpIntoLevel > p.xpNeeded) {
    progressOk = false;
    progressDetail = "xp " + xp + " into " + p.xpIntoLevel + "/" + p.xpNeeded;
    break;
  }
  if (p.nextThreshold <= p.currentThreshold) {
    progressOk = false;
    progressDetail = "xp " + xp + " nguong khong tang";
    break;
  }
}
check(
  "progress luon trong [0,1) va xpIntoLevel <= xpNeeded",
  progressOk,
  progressDetail,
);

const p0 = getLevelProgress(0);
check("xp 0 -> progress 0", p0.progress === 0, String(p0.progress));

section("xp.ts: calculateRoundXp");
check(
  "diem 0 -> 15 xp san",
  calculateRoundXp(0) === 15,
  String(calculateRoundXp(0)),
);
check(
  "diem 1000 -> tran " + MAX_XP_PER_ROUND,
  calculateRoundXp(1000) === MAX_XP_PER_ROUND,
  String(calculateRoundXp(1000)),
);
check(
  "diem am bi kep ve 15",
  calculateRoundXp(-500) === 15,
  String(calculateRoundXp(-500)),
);
check(
  "diem 99999 khong vuot tran",
  calculateRoundXp(99999) === MAX_XP_PER_ROUND,
  String(calculateRoundXp(99999)),
);
let xpMonoOk = true;
for (let s = 0; s <= 1000; s++) {
  if (calculateRoundXp(s) < calculateRoundXp(Math.max(0, s - 1)))
    xpMonoOk = false;
}
check("xp moi van khong giam khi diem tang", xpMonoOk);

section("xp.ts: getLevelTitle");
check("level 1 -> Novice", getLevelTitle(1) === "Novice");
check("level 5 -> Explorer", getLevelTitle(5) === "Explorer");
check("level 50 -> Neuro Sage", getLevelTitle(50) === "Neuro Sage");

// ------------------------------------------------------------ GAME REGISTRY
section("game-registry.ts");
check("registry co game", GAME_IDS.length > 0, String(GAME_IDS.length));
check(
  "game id khong trung",
  new Set(GAME_IDS).size === GAME_IDS.length,
  GAME_IDS.join(","),
);
check(
  "session column phu dung tung game",
  GAME_REGISTRY.every((game) => game.sessionColumn === `${game.id}_sessions`),
);
check(
  "session column khong trung",
  new Set(SESSION_COLUMNS).size === SESSION_COLUMNS.length,
);
check(
  "GAME_BY_ID phu het registry",
  GAME_REGISTRY.every((game) => GAME_BY_ID[game.id] === game),
);
check(
  "primary/secondary axis hop le",
  GAME_REGISTRY.every(
    (game) =>
      game.primaryAxis in AXIS_COLUMNS && game.secondaryAxis in AXIS_COLUMNS,
  ),
);
check(
  "tag/description ton tai o ca vi va en",
  GAME_REGISTRY.every(
    (game) =>
      game.tagKey in vi &&
      game.tagKey in en &&
      game.descriptionKey in vi &&
      game.descriptionKey in en,
  ),
);
check("isGameId nhan game hop le", GAME_IDS.every(isGameId));
check("isGameId tu choi game la", !isGameId("unknown-game"));
check(
  "client/server game ids khop tuyet doi",
  JSON.stringify(GAME_IDS) === JSON.stringify(SERVER_GAME_IDS),
  `client=${GAME_IDS.join(",")} server=${SERVER_GAME_IDS.join(",")}`,
);
check("server type guard nhan du game", SERVER_GAME_IDS.every(isServerGame));
check("server type guard tu choi game la", !isServerGame("unknown-game"));

// ------------------------------------------------------------------ SESSIONS
section("sessions.ts");
check(
  "so session column khop registry",
  SESSION_COLUMNS.length === GAME_IDS.length,
  `${SESSION_COLUMNS.length}/${GAME_IDS.length}`,
);
check("null profile -> 0", totalSessions(null) === 0);
check("undefined -> 0", totalSessions(undefined) === 0);
check("object rong -> 0", totalSessions({}) === 0);
check(
  "cong dung tong",
  totalSessions({
    schulte_sessions: 3,
    math_sessions: 4,
    nback_sessions: null,
  }) === 7,
);

// ---------------------------------------------------------------------- AXES
section("axes.ts");
const axisKeys = Object.keys(AXIS_COLUMNS);
check("co 5 truc", axisKeys.length === 5, String(axisKeys.length));
check(
  "AXIS_META phu het truc trong AXIS_COLUMNS",
  axisKeys.every((k) => (AXIS_META as Record<string, unknown>)[k] != null),
);
check(
  "AXIS_META.column tro dung cot",
  axisKeys.every(
    (k) =>
      (AXIS_META as Record<string, { column: string }>)[k].column ===
      (AXIS_COLUMNS as Record<string, string>)[k],
  ),
);
const colVals = Object.values(AXIS_COLUMNS);
check("khong co cot trung", new Set(colVals).size === colVals.length);
const colorVals = axisKeys.map(
  (k) => (AXIS_META as Record<string, { color: string }>)[k].color,
);
check("khong co mau trung", new Set(colorVals).size === colorVals.length);

// -------------------------------------------------------------------- SUDOKU
section("sudoku-gen.ts (bo sinh de)");

function validFullGrid(g: number[][]): boolean {
  for (let i = 0; i < 9; i++) {
    const row = new Set(g[i]);
    const col = new Set(g.map((r) => r[i]));
    if (row.size !== 9 || col.size !== 9) return false;
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const box = new Set<number>();
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) box.add(g[br + i][bc + j]);
      if (box.size !== 9) return false;
    }
  }
  return true;
}

function puzzleMatchesSolution(
  puzzle: (number | null)[][],
  solution: number[][],
): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] != null && puzzle[r][c] !== solution[r][c]) return false;
  return true;
}

function countClues(puzzle: (number | null)[][]): number {
  let n = 0;
  for (const row of puzzle) for (const v of row) if (v != null) n++;
  return n;
}

// Cac muc do that trong sudoku-game.tsx
const clueTargets = [50, 42, 34, 28, 24];
let gridValid = true;
let uniqueOk = true;
let consistentOk = true;
let clueCountOk = true;
let detail = "";

for (const target of clueTargets) {
  for (let rep = 0; rep < 3; rep++) {
    const { puzzle, solution, actualClues, budgetExceeded } =
      generateSudoku(target);
    if (!validFullGrid(solution)) {
      gridValid = false;
      detail = "loi grid o clues=" + target;
    }
    if (!puzzleMatchesSolution(puzzle, solution)) {
      consistentOk = false;
      detail = "puzzle lech solution o clues=" + target;
    }
    if (countSolutions(puzzle, 2) !== 1) {
      uniqueOk = false;
      detail = "khong duy nhat nghiem o clues=" + target;
    }
    const real = countClues(puzzle);
    if (real !== actualClues) {
      clueCountOk = false;
      detail =
        "actualClues=" +
        actualClues +
        " nhung dem duoc " +
        real +
        " (clues=" +
        target +
        ", budgetExceeded=" +
        budgetExceeded +
        ")";
    }
  }
}

check("solution luon la luoi sudoku hop le", gridValid, detail);
check("puzzle luon la tap con cua solution", consistentOk, detail);
check("puzzle luon co DUY NHAT 1 nghiem", uniqueOk, detail);
check("actualClues khop so o thuc te con lai", clueCountOk, detail);

// tinh ngau nhien: 2 lan sinh khong duoc giong het nhau
const a = generateSudoku(34).solution.flat().join("");
const b = generateSudoku(34).solution.flat().join("");
check("hai lan sinh ra loi giai khac nhau", a !== b);

// clues cuc doan
const easy = generateSudoku(81);
check(
  "clues=81 -> khong dao o nao",
  countClues(easy.puzzle) === 81,
  String(countClues(easy.puzzle)),
);

console.log("\n" + "=".repeat(50));
console.log("TONG: " + pass + "/" + (pass + fails.length) + " dat");
if (fails.length) {
  console.log("THAT BAI:");
  for (const f of fails) console.log("  - " + f);
}
