// Server-side source of truth for round validation and cognitive scoring.
export type Game =
  | "schulte"
  | "sudoku"
  | "stroop"
  | "reaction"
  | "memory"
  | "nback"
  | "math";
export type AxisRatings = {
  speed: number | null;
  focus: number | null;
  spatial: number | null;
  logic: number | null;
  memory: number | null;
};
export type ScoredRound = {
  axes: AxisRatings;
  headline: number;
  label: string;
  timeMs: number;
};

const NO_AXES: AxisRatings = {
  speed: null,
  focus: null,
  spatial: null,
  logic: null,
  memory: null,
};
const MAX = 1000;
const clamp = (n: number) => Math.max(0, Math.min(MAX, Math.round(n)));
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const finite = (n: unknown, name: string, min = 0, max = 7_200_000): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Error(`Invalid ${name}`);
  return v;
};
const int = (n: unknown, name: string, min = 0, max = 10_000) =>
  Math.round(finite(n, name, min, max));
const numberArray = (
  v: unknown,
  name: string,
  minLength: number,
  maxLength: number,
): number[] => {
  if (!Array.isArray(v) || v.length < minLength || v.length > maxLength)
    throw new Error(`Invalid ${name} length`);
  // Lần nhập đầu tiên có thể bằng 0ms nếu xảy ra trong cùng một clock tick.
  // Chuẩn hóa thành 1ms thay vì từ chối toàn bộ kết quả ván.
  return v.map((x, i) =>
    Math.max(1, finite(x, `${name}[${i}]`, 0, 3_600_000)),
  );
};
/**
 * Bỏ mốc khởi động ra khỏi thống kê nhịp độ.
 * Ở Schulte, Sudoku và Stroop, đồng hồ chỉ bắt đầu chạy từ cú click đầu tiên,
 * nên phần tử đầu của mảng RT luôn xấp xỉ 0ms. Con số giả này kéo CV phình lên
 * và ép Focus xuống oan. Mảng vẫn giữ nguyên độ dài lúc kiểm tra hợp lệ; chỉ
 * riêng khi tính median và CV mới loại nó ra.
 */
const withoutStartArtifact = (rts: number[], thresholdMs = 80): number[] =>
  rts.length > 1 && rts[0] <= thresholdMs ? rts.slice(1) : rts;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) =>
  xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m <= 0) return 0;
  return (
    Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) / m
  );
};
const lapseRate = (xs: number[]) => {
  if (xs.length < 3) return 0;
  const m = median(xs);
  return xs.filter((x) => x > m * 2.5).length / xs.length;
};
const ratio = (target: number, actual: number) =>
  Math.min(target / Math.max(actual, 1), 1.4);
const speed = (
  rts: number[],
  target: number,
  diff: number,
  fallback?: number,
) => {
  const m = rts.length ? median(rts) : (fallback ?? 0);
  return m > 0 ? clamp(MAX * diff * ratio(target, m)) : 0;
};
const focus = (rts: number[], accuracy: number, diff: number) => {
  const penalty = clamp01((cv(rts) - 0.25) / (1.2 - 0.25));
  return clamp(
    MAX * diff * (1 - penalty * 0.6) * (1 - lapseRate(rts)) * accuracy,
  );
};
const headline = (axes: AxisRatings) =>
  Math.max(0, ...Object.values(axes).filter((v): v is number => v !== null));

const SCHULTE_DIFF: Record<number, number> = {
  9: 0.55,
  16: 0.72,
  25: 0.86,
  36: 1,
};
const SCHULTE_TARGET: Record<number, number> = {
  9: 20000,
  16: 45000,
  25: 90000,
  36: 160000,
};
const SUDOKU_DIFF: Record<string, number> = {
  Easy: 0.5,
  Medium: 0.6,
  Hard: 0.7,
  Expert: 0.8,
  Master: 0.9,
  Extreme: 1,
};
// So clue chuan cua tung muc do kho (khop SUDOKU_LEVELS ben client).
// Neu de that co NHIEU clue hon muc chuan => generator het budget, de de hon.
const SUDOKU_CLUES: Record<string, number> = {
  Easy: 38,
  Medium: 36,
  Hard: 32,
  Expert: 30,
  Master: 26,
  Extreme: 23,
};

/**
 * Quy so clue THUC TE ve he so kho.
 *
 * Truoc day chi doc nhan `difficulty` client gui len, nen mot van "Extreme"
 * bi cat dao som (de hon nhieu) van duoc cham he so 1.0. Gio lay he so cua
 * muc do kho gan nhat voi so clue that, va khong bao gio cao hon nhan.
 */
function effectiveSudokuDiff(
  difficulty: string,
  actualClues: number | null,
): number {
  const labelled = SUDOKU_DIFF[difficulty];
  if (actualClues === null) return labelled;
  const expected = SUDOKU_CLUES[difficulty];
  if (expected === undefined || actualClues <= expected) return labelled;

  // De de hon nhan: tim muc co so clue chuan >= so clue that (de nhat phu hop).
  let best = labelled;
  for (const [name, clues] of Object.entries(SUDOKU_CLUES)) {
    if (clues >= actualClues) {
      const d = SUDOKU_DIFF[name];
      if (d !== undefined && d < best) best = d;
    }
  }
  return best;
}

const SUDOKU_TARGET: Record<string, number> = {
  Easy: 240000,
  Medium: 360000,
  Hard: 480000,
  Expert: 720000,
  Master: 960000,
  Extreme: 1500000,
};

function scoreSchulte(t: any): ScoredRound {
  const cells = int(t?.cells, "cells", 9, 36);
  if (![9, 16, 25, 36].includes(cells)) throw new Error("Invalid Schulte size");
  const timeMs = finite(t?.timeMs, "timeMs", 100, 3_600_000);
  // Van THUA (het tim) dung giua chung, nen so mau hitRts BANG so o da tim
  // duoc chu khong bang cells. Truoc day server bat buoc hitRts.length ===
  // cells nen MOI van Schulte thua deu bi tra ve 400 "Invalid hitRts length",
  // keo theo mat streak/quest/ticket cua van do. Van thua duoc chap nhan voi
  // hitRts ngan hon, va bi ha diem theo ty le hoan thanh.
  const failed = t?.failed === true;
  const rts = numberArray(t?.hitRts, "hitRts", failed ? 0 : cells, cells);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 500);
  const diff = SCHULTE_DIFF[cells];
  const per = SCHULTE_TARGET[cells] / cells;
  const found = rts.length;
  // Ty le hoan thanh: van thang = 1, van thua = phan da tim duoc.
  const completion = clamp01(found / cells);
  const accuracy = found + wrong > 0 ? found / (found + wrong) : 0;
  const statRts = withoutStartArtifact(rts);
  const late = statRts.slice(Math.floor((statRts.length * 2) / 3));
  const spatial = late.length
    ? clamp(MAX * diff * ratio(per * 1.6, median(late)) * accuracy * completion)
    : 0;
  const axes = {
    ...NO_AXES,
    // Khong tim duoc o nao => khong co tin hieu nhip do, de speed null.
    speed: found
      ? clamp(speed(statRts, per, diff, timeMs / found) * completion)
      : null,
    focus: found ? clamp(focus(statRts, accuracy, diff) * completion) : 0,
    spatial,
  };
  const size = Math.round(Math.sqrt(cells));
  return {
    axes,
    headline: headline(axes),
    label: String(t?.modeLabel ?? `${size}×${size}`),
    timeMs,
  };
}
function scoreSudoku(t: any): ScoredRound {
  const difficulty = String(t?.difficulty ?? "");
  if (!(difficulty in SUDOKU_DIFF))
    throw new Error("Invalid Sudoku difficulty");
  const timeMs = finite(t?.timeMs, "timeMs", 500, 7_200_000);
  // Ván thua (het mang) co the placements = 0.
  const placements = int(t?.placements, "placements", 0, 200);
  const rts = numberArray(
    t?.moveRts,
    "moveRts",
    0,
    Math.max(placements + 3, 1),
  );
  const mistakes = int(t?.mistakes, "mistakes", 0, 3);
  const failed = t?.failed === true || mistakes >= 3;
  const reEntries = int(t?.reEntries, "reEntries", 0, 100);
  const repeat = int(t?.repeatMistakes, "repeatMistakes", 0, 100);
  // Chi tin so clue trong khoang hop le; ngoai khoang thi bo qua.
  const rawClues = t?.actualClues;
  const actualClues =
    typeof rawClues === "number" && Number.isFinite(rawClues) && rawClues >= 17 && rawClues <= 81
      ? Math.round(rawClues)
      : null;
  const diff = effectiveSudokuDiff(difficulty, actualClues);
  const per = SUDOKU_TARGET[difficulty] / Math.max(1, placements);
  const logic = clamp(MAX * diff * (1 - clamp01(mistakes / 3)));
  const retention =
    1 - clamp01((reEntries + repeat * 1.5) / Math.max(4, placements * 0.25));
  const axes = {
    ...NO_AXES,
    // placements=0 (thua som): khong co RT hop le → speed null, chi logic/memory.
    speed:
      placements > 0 && rts.length > 0
        ? speed(
            withoutStartArtifact(rts),
            per,
            diff,
            timeMs / Math.max(1, placements),
          )
        : null,
    logic: failed ? clamp(logic * 0.35) : logic,
    memory: failed ? clamp(MAX * diff * retention * 0.5) : clamp(MAX * diff * retention),
  };
  return {
    axes,
    headline: headline(axes),
    label: failed ? `${difficulty} (failed)` : difficulty,
    timeMs,
  };
}
function scoreStroop(t: any): ScoredRound {
  // totalStimuli = so lan stimulus da hien (dung + sai), khong con hardcode 20.
  const total = int(t?.totalStimuli, "totalStimuli", 1, 80);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 20);
  const rts = numberArray(t?.rts, "rts", 0, total);
  const timeMs = finite(t?.timeMs, "timeMs", 1_000, 600_000);
  if (rts.length + wrong > total)
    throw new Error("Stroop telemetry is inconsistent");
  // Accuracy tren cac lan tra loi; completion so voi so stimulus da hien.
  const answered = rts.length + wrong;
  const accuracy =
    answered > 0 ? rts.length / answered : 0;
  const statRts = withoutStartArtifact(rts);
  const axes = {
    ...NO_AXES,
    speed: speed(statRts, 1800, 0.82, timeMs / Math.max(1, rts.length)),
    focus: focus(statRts, accuracy, 0.82),
  };
  return { axes, headline: headline(axes), label: "Stroop Test", timeMs };
}
function scoreReaction(t: any): ScoredRound {
  const rts = numberArray(t?.rts, "rts", 5, 5);
  const falseStarts = int(t?.falseStarts, "falseStarts", 0, 50);
  const timeMs = finite(t?.timeMs, "timeMs", 5, 60_000);
  const accuracy = rts.length / (rts.length + falseStarts);
  const axes = {
    ...NO_AXES,
    speed: speed(rts, 350, 1),
    focus: focus(rts, accuracy, 0.9),
  };
  return { axes, headline: headline(axes), label: "Reaction Time", timeMs };
}
function scoreMemory(t: any): ScoredRound {
  // Thua ngay cap 1 thi pha recall rat ngan; nguong 800ms cu lam van do bi
  // tu choi thay vi duoc cham 0.
  const timeMs = finite(t?.timeMs, "timeMs", 100, 7_200_000);
  // clearedLevels = so cap THUC SU vuot qua (0 khi chua nho noi o nao).
  // maxLevel la truong cu, giu de tuong thich client chua cap nhat.
  const level =
    t?.clearedLevels !== undefined
      ? int(t?.clearedLevels, "clearedLevels", 0, 100)
      : int(t?.maxLevel, "maxLevel", 1, 100);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 100);
  const progression = clamp01(level / 12),
    cells = Math.max(1, Math.round(level * 3)),
    accuracy = level > 0 ? cells / (cells + wrong) : 0;
  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * 0.9 * progression * accuracy),
    spatial: clamp(MAX * 0.7 * progression * accuracy),
  };
  return { axes, headline: headline(axes), label: `Level ${level}`, timeMs };
}

// Math Sprint: logic (dung/sai) + toc do (do tre tung cau).
const MATH_DIFF: Record<string, number> = {
  easy: 0.62,
  medium: 0.82,
  hard: 1.0,
};
const MATH_TARGET_MS: Record<string, number> = {
  easy: 3000,
  medium: 4200,
  hard: 5500,
};
const MATH_LABEL: Record<string, string> = {
  easy: "Math Easy",
  medium: "Math Medium",
  hard: "Math Hard",
};
function scoreMath(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 3_000, 7_200_000);
  const difficulty = String(t?.difficulty ?? "medium");
  if (!(difficulty in MATH_DIFF)) throw new Error("Invalid math difficulty");
  const totalProblems = int(t?.totalProblems, "totalProblems", 5, 100);
  const correct = int(t?.correct, "correct", 0, 100);
  const wrong = int(t?.wrong, "wrong", 0, 100);
  const rts = numberArray(t?.rts, "rts", 0, 200);

  if (correct + wrong > totalProblems)
    throw new Error("Math telemetry is inconsistent");
  if (rts.length > 0 && rts.length !== correct + wrong)
    throw new Error("Math rts length mismatch");

  const accuracy = clamp01(correct / Math.max(1, totalProblems));
  const diff = MATH_DIFF[difficulty];
  const target = MATH_TARGET_MS[difficulty];
  const clean = withoutStartArtifact(rts, 80);
  const med = clean.length ? median(clean) : target;
  const pace = clamp01((2 * target - med) / target);

  const axes = {
    ...NO_AXES,
    logic: clamp(MAX * diff * accuracy * (0.72 + 0.28 * pace)),
    speed:
      clean.length >= 3
        ? clamp(speed(clean, target, diff) * (0.55 + 0.45 * accuracy))
        : null,
  };
  return {
    axes,
    headline: headline(axes),
    label: MATH_LABEL[difficulty] ?? "Math Sprint",
    timeMs,
  };
}

// N-Back: do tri nho lam viec. Client gui so lan dung/sai va do tre phan hoi.
function scoreNBack(t: any): ScoredRound {
  const timeMs = finite(t?.timeMs, "timeMs", 3_000, 7_200_000);
  const n = int(t?.n, "n", 1, 9);
  const trials = int(t?.trials, "trials", 5, 200);
  const hits = int(t?.hits, "hits", 0, 200);
  const misses = int(t?.misses, "misses", 0, 200);
  const falseAlarms = int(t?.falseAlarms, "falseAlarms", 0, 200);
  const rts = withoutStartArtifact(numberArray(t?.rts, "rts", 0, 200), 80);

  if (hits + misses > trials || falseAlarms > trials)
    throw new Error("N-Back telemetry is inconsistent");

  const targets = hits + misses;
  // d-prime rut gon: ti le bat dung tru ti le bao dong nham.
  const hitRate = targets > 0 ? hits / targets : 0;
  const faRate = clamp01(falseAlarms / Math.max(1, trials - targets));
  const accuracy = clamp01(hitRate - faRate * 0.75);
  // Moi muc n cao hon thi tran diem cao hon (n=2 la moc chuan).
  const depth = clamp01((n + 1) / 5);

  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * accuracy * (0.62 + 0.38 * depth)),
    focus: clamp(
      MAX * accuracy * (0.55 + 0.45 * clamp01(1 - faRate)) * (0.7 + 0.3 * depth),
    ),
    speed: rts.length >= 3 ? speed(rts, 700, 0.85) : null,
  };
  return { axes, headline: headline(axes), label: `${n}-Back`, timeMs };
}

// ---- Rang buoc bien cho telemetry tho (chong gia mao tu DevTools) ----
// Khong the chung minh tuyet doi, nhung chan duoc cac gia tri phi ly.
const MIN_RT_MS = 120; // nhanh hon nguong nay la khong kha thi voi nguoi that
const MAX_RT_MS = 60_000;

function assertRtBounds(
  rts: unknown,
  serverElapsedMs: number,
  label: string,
): void {
  if (rts == null) return;
  if (!Array.isArray(rts)) throw new Error(`${label}: rts must be an array`);
  if (rts.length > 5_000) throw new Error(`${label}: too many reaction times`);
  let total = 0;
  for (const r of rts) {
    if (typeof r !== "number" || !Number.isFinite(r))
      throw new Error(`${label}: reaction time is not a number`);
    if (r < MIN_RT_MS)
      throw new Error(`${label}: reaction time below human threshold`);
    if (r > MAX_RT_MS)
      throw new Error(`${label}: reaction time out of range`);
    total += r;
  }
  // Tong thoi gian phan ung khong the vuot thoi gian van dau (dem bien 15s).
  if (total > serverElapsedMs + 15_000)
    throw new Error(`${label}: sum of reaction times exceeds round duration`);
}

function assertCountBounds(game: Game, telemetry: unknown): void {
  const t = (telemetry ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = t[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const nonNeg = (k: string) => {
    const v = num(k);
    if (v !== null && v < 0) throw new Error(`${game}: ${k} cannot be negative`);
  };
  for (const k of [
    "wrongClicks",
    "mistakes",
    "correct",
    "wrong",
    "hits",
    "misses",
    "falseAlarms",
    "falseStarts",
    "totalStimuli",
    "trials",
    "targets",
    "maxLevel",
  ])
    nonNeg(k);

  const rtsLen = Array.isArray(t.rts) ? t.rts.length : null;

  if (game === "nback") {
    const trials = num("trials");
    const targets = num("targets");
    const hits = num("hits");
    const fa = num("falseAlarms");
    if (trials !== null && targets !== null && targets > trials)
      throw new Error("nback: targets exceed trials");
    if (targets !== null && hits !== null && hits > targets)
      throw new Error("nback: hits exceed targets");
    if (trials !== null && fa !== null && fa > trials)
      throw new Error("nback: false alarms exceed trials");
    if (trials !== null && rtsLen !== null && rtsLen > trials)
      throw new Error("nback: more reaction times than trials");
  }

  if (game === "math") {
    const correct = num("correct");
    const wrong = num("wrong");
    const total = num("total");
    if (correct !== null && wrong !== null && total !== null && correct + wrong > total)
      throw new Error("math: answered more problems than served");
    if (rtsLen !== null && total !== null && rtsLen > total)
      throw new Error("math: more reaction times than problems");
  }

  if (game === "stroop") {
    const totalStimuli = num("totalStimuli");
    const wrongClicks = num("wrongClicks");
    if (totalStimuli !== null && wrongClicks !== null && wrongClicks > totalStimuli)
      throw new Error("stroop: wrong clicks exceed stimuli shown");
    if (totalStimuli !== null && rtsLen !== null && rtsLen > totalStimuli)
      throw new Error("stroop: more reaction times than stimuli");
  }
}

export function scoreAndValidate(
  game: Game,
  telemetry: unknown,
  serverElapsedMs: number,
): ScoredRound {
  if (
    !Number.isFinite(serverElapsedMs) ||
    serverElapsedMs < 500 ||
    serverElapsedMs > 2 * 60 * 60 * 1000
  )
    throw new Error("Round duration is invalid or expired");

  // Chan telemetry phi ly TRUOC khi cham diem.
  assertCountBounds(game, telemetry);
  assertRtBounds(
    (telemetry as { rts?: unknown } | null)?.rts,
    serverElapsedMs,
    game,
  );

  const scored =
    game === "schulte"
      ? scoreSchulte(telemetry)
      : game === "sudoku"
        ? scoreSudoku(telemetry)
        : game === "stroop"
          ? scoreStroop(telemetry)
          : game === "reaction"
            ? scoreReaction(telemetry)
            : game === "nback"
              ? scoreNBack(telemetry)
              : game === "math"
                ? scoreMath(telemetry)
                : scoreMemory(telemetry);
  // Client time may exclude fixed animations/wait periods. It may not exceed server elapsed by >15s.
  if (scored.timeMs > serverElapsedMs + 15_000)
    throw new Error("Telemetry time exceeds server round time");
  return scored;
}
