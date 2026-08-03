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

/**
 * Mau dung de tinh THONG KE (median, CV, lapse).
 *
 * Truoc day assertRtBounds nem loi cung khi bat ky mau nao < 120ms, nhung chi
 * rieng Math kep san o client. Mot cu bam anticipation ~100ms o Reaction hay
 * N-Back (hoan toan co that) lam hong ca van hop le. Gio nguong 120ms chi con
 * la san THONG KE: mau duoi nguong bi loai khoi tinh toan (va anticheat ghi
 * soft flag), con hard-reject chi xay ra duoi HUMAN_FLOOR_MS = 80ms.
 */
const statSamples = (rts: number[], thresholdMs = 80): number[] =>
  withoutStartArtifact(rts, thresholdMs).filter((r) => r >= MIN_RT_MS);

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
// Tran thuong toc do: truoc 1.4 qua rong — choi hon target 1 chut la bung max.
// 1.15 = chi elite (nhanh hon target ~13%) moi cham tran ratio.
const RATIO_CAP = 1.15;
const ratio = (target: number, actual: number) =>
  Math.min(target / Math.max(actual, 1), RATIO_CAP);
const speed = (
  rts: number[],
  target: number,
  diff: number,
  fallback?: number,
) => {
  const m = rts.length ? median(rts) : (fallback ?? 0);
  return m > 0 ? clamp(MAX * diff * ratio(target, m)) : 0;
};
// Focus: phat CV som hon (0.18 thay 0.25) va nang hon (0.75 thay 0.6).
// He so 0.92 de choi "deu + dung" van kho full 1000 neu diff < 1.
const FOCUS_CV_OK = 0.18;
const FOCUS_CV_BAD = 1.05;
const FOCUS_SCALE = 0.92;
/**
 * He so nhip do cho Focus. Truoc day Focus chi nhin CV + accuracy — choi CHAM
 * nhung DEU (co tinh ngu) van duoc Focus cao. Gio cham hon target thi Focus
 * bi ha: median = 2x target ~ giam manh, 3x target ~ gan 0.
 * paceTargetMs = null => bo qua (Memory khong co tin hieu RT nhip do).
 */
const focusPace = (rts: number[], paceTargetMs: number | null | undefined) => {
  if (paceTargetMs == null || paceTargetMs <= 0 || rts.length < 1) return 1;
  const m = median(rts);
  if (m <= 0) return 1;
  // 1.0 khi <= target; 0.55 o 2x; ~0.15 o 3x; 0 khi >= 4x.
  return clamp01((4 * paceTargetMs - m) / (3 * paceTargetMs));
};
const focus = (
  rts: number[],
  accuracy: number,
  diff: number,
  paceTargetMs?: number | null,
) => {
  const penalty = clamp01(
    (cv(rts) - FOCUS_CV_OK) / (FOCUS_CV_BAD - FOCUS_CV_OK),
  );
  const pace = focusPace(rts, paceTargetMs);
  return clamp(
    MAX *
      diff *
      FOCUS_SCALE *
      (1 - penalty * 0.75) *
      (1 - lapseRate(rts) * 1.15) *
      Math.pow(accuracy, 1.15) *
      Math.pow(pace, 1.25),
  );
};
// Headline = trung binh cac truc active (khong con lay max) de 1 truc full
// khong keo ca van len 1000.
const headline = (axes: AxisRatings) => {
  const vals = Object.values(axes).filter((v): v is number => v !== null);
  if (!vals.length) return 0;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
};

const SCHULTE_DIFF: Record<number, number> = {
  9: 0.48,
  16: 0.64,
  25: 0.78,
  36: 0.92,
};
// Target chat hon: choi "kha" nam ~650-800, elite moi ~900+.
const SCHULTE_TARGET: Record<number, number> = {
  9: 14000,
  16: 32000,
  25: 65000,
  36: 120000,
};
const SUDOKU_DIFF: Record<string, number> = {
  Easy: 0.42,
  Medium: 0.54,
  Hard: 0.66,
  Expert: 0.78,
  Master: 0.88,
  Extreme: 0.96,
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

// Target thap hon = de kho dat full Speed hon (phai choi nhanh that).
const SUDOKU_TARGET: Record<string, number> = {
  Easy: 180000,
  Medium: 280000,
  Hard: 400000,
  Expert: 600000,
  Master: 820000,
  Extreme: 1200000,
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
  const statRts = statSamples(rts);
  const late = statRts.slice(Math.floor((statRts.length * 2) / 3));
  // 1.25 (truoc 1.6): late-phase khong con de "an" spatial bang nhip som.
  const spatial = late.length
    ? clamp(
        MAX * diff * ratio(per * 1.25, median(late)) * accuracy * completion,
      )
    : 0;
  const axes = {
    ...NO_AXES,
    // Khong tim duoc o nao => khong co tin hieu nhip do, de speed null.
    speed: found
      ? clamp(speed(statRts, per, diff, timeMs / found) * completion)
      : null,
    focus: found
      ? clamp(focus(statRts, accuracy, diff, per) * completion)
      : 0,
    spatial,
  };
  const size = Math.round(Math.sqrt(cells));
  // Danh dau "(failed)" de get_personal_bests loc duoc van thua ra khoi ky luc
  // thoi gian — van thua bo dang luon ngan bat thuong nen se chiem cho "Best".
  const baseLabel = String(t?.modeLabel ?? `${size}×${size}`);
  return {
    axes,
    headline: headline(axes),
    label: failed ? `${baseLabel} (failed)` : baseLabel,
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
  // LO HONG CU: per = TARGET / placements, tuc chia cho so nuoc THUC TE da dat.
  // Dat dung 2 so o ban Easy roi co tinh thua => per = 240000/2 = 120000ms,
  // moi nhip choi deu "nhanh hon muc tieu" => ratio cham tran 1.4 => Speed ~700
  // du chi choi 10 giay. `failed` chi phat Logic/Memory nen Speed thoat sach.
  // Gio chia cho so nuoc KY VONG cua ca de, va nhan Speed theo ty le hoan thanh.
  const expected = Math.max(
    1,
    81 - (actualClues ?? SUDOKU_CLUES[difficulty] ?? 30),
  );
  const per = SUDOKU_TARGET[difficulty] / expected;
  const completion = clamp01(placements / expected);
  // Logic: sai 1 nuoc phat nang hon; perfect van bi diff gioi han.
  const logic = clamp(
    MAX * diff * Math.pow(1 - clamp01(mistakes / 3), 1.35),
  );
  const retention =
    1 - clamp01((reEntries + repeat * 1.75) / Math.max(3, placements * 0.2));
  const axes = {
    ...NO_AXES,
    // placements=0 (thua som): khong co RT hop le → speed null, chi logic/memory.
    speed:
      placements > 0 && rts.length > 0
        ? clamp(
            speed(
              statSamples(rts),
              per,
              diff,
              timeMs / Math.max(1, placements),
            ) * completion,
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
/** So cau chuan de hoan thanh mot van Stroop (khop TOTAL ben stroop-game.tsx). */
const STROOP_TRIALS = 30;

function scoreStroop(t: any): ScoredRound {
  // totalStimuli = so lan stimulus da hien (dung + sai), khong con hardcode 20.
  const total = int(t?.totalStimuli, "totalStimuli", 1, 80);
  const wrong = int(t?.wrongClicks, "wrongClicks", 0, 20);
  const rts = numberArray(t?.rts, "rts", 0, total);
  const timeMs = finite(t?.timeMs, "timeMs", 1_000, 600_000);
  if (rts.length + wrong > total)
    throw new Error("Stroop telemetry is inconsistent");
  // Accuracy tren cac lan tra loi.
  const answered = rts.length + wrong;
  const accuracy = answered > 0 ? rts.length / answered : 0;
  // LO HONG CU: comment noi co "completion" nhung bien do khong he ton tai, nen
  // tra loi dung 3-4 cau that nhanh roi co tinh bam sai 3 lan de ket thuc van
  // se duoc cham Speed tren median cua 3 mau ma khong bi phat gi. Completion
  // phai so voi SO CAU CHUAN cua ca van (khong phai so stimulus da hien - con
  // so do luon bang so cau da lam nen ty le luon = 1).
  const completion = clamp01(rts.length / STROOP_TRIALS);
  const statRts = statSamples(rts);
  const axes = {
    ...NO_AXES,
    // Target 1400ms (truoc 1800): choi kha ~1100 van chua full.
    speed: clamp(
      speed(statRts, 1400, 0.78, timeMs / Math.max(1, rts.length)) *
        completion,
    ),
    focus: clamp(focus(statRts, accuracy, 0.78, 1400) * completion),
  };
  return { axes, headline: headline(axes), label: "Stroop Test", timeMs };
}
function scoreReaction(t: any): ScoredRound {
  // Client hien tai gui dung 10 mau. Cho 8-12 de tuong thich ban cu/moi.
  const rts = numberArray(t?.rts, "rts", 8, 12);
  const falseStarts = int(t?.falseStarts, "falseStarts", 0, 50);
  const timeMs = finite(t?.timeMs, "timeMs", 5, 120_000);
  const accuracy = rts.length / (rts.length + falseStarts);
  // Bam anticipation ~100ms la co that o Reaction: mau do bi loai khoi thong ke
  // thay vi lam hong ca van (xem statSamples).
  const statRts = statSamples(rts);
  // Target 280ms (truoc 350): RT binh thuong 300-400 khong con full 1000.
  // diff 0.95: ke ca elite cung can ratio cap de cham tran.
  const axes = {
    ...NO_AXES,
    speed: speed(statRts, 280, 0.95),
    focus: focus(statRts, accuracy, 0.88, 280),
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
  // /16 (truoc /12): can len cao hon de full. He so memory/spatial ha nhe.
  const progression = clamp01(level / 16),
    cells = Math.max(1, Math.round(level * 3)),
    accuracy = level > 0 ? cells / (cells + wrong * 1.25) : 0;
  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * 0.88 * Math.pow(progression, 1.1) * accuracy),
    spatial: clamp(MAX * 0.68 * Math.pow(progression, 1.1) * accuracy),
  };
  return { axes, headline: headline(axes), label: `Level ${level}`, timeMs };
}

// Math Sprint: logic (dung/sai) + toc do (do tre tung cau).
const MATH_DIFF: Record<string, number> = {
  easy: 0.55,
  medium: 0.74,
  hard: 0.92,
  // Adaptive: de -> vua -> kho trong 1 van; he so nam giua medium va hard.
  adaptive: 0.84,
};
// Target thap hon = phai tra loi nhanh that de full speed.
const MATH_TARGET_MS: Record<string, number> = {
  easy: 2400,
  medium: 3400,
  hard: 4600,
  adaptive: 3800,
};
const MATH_LABEL: Record<string, string> = {
  easy: "Math Easy",
  medium: "Math Medium",
  hard: "Math Hard",
  adaptive: "Math Adaptive",
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
  const clean = statSamples(rts, 80);
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
  const rts = statSamples(numberArray(t?.rts, "rts", 0, 200), 80);

  if (hits + misses > trials || falseAlarms > trials)
    throw new Error("N-Back telemetry is inconsistent");

  const targets = hits + misses;
  // d-prime rut gon: ti le bat dung tru ti le bao dong nham.
  const hitRate = targets > 0 ? hits / targets : 0;
  // FA phat nang hon (0.95): bam nham nhieu ha diem ro.
  const faRate = clamp01(falseAlarms / Math.max(1, trials - targets));
  const accuracy = clamp01(hitRate - faRate * 0.95);
  // n=2 ~0.33, n=3 ~0.5, n=4 ~0.67, n=5 ~0.83, n=6 = day. Truoc /5 de full o n=5.
  const depth = clamp01(n / 6);

  const axes = {
    ...NO_AXES,
    memory: clamp(MAX * Math.pow(accuracy, 1.2) * (0.55 + 0.4 * depth)),
    focus: clamp(
      MAX *
        Math.pow(accuracy, 1.15) *
        (0.5 + 0.4 * clamp01(1 - faRate)) *
        (0.65 + 0.3 * depth),
    ),
    // Target 550ms (truoc 700), diff 0.8: RT thuong ~700-800 khong full.
    speed: rts.length >= 3 ? speed(rts, 550, 0.8) : null,
  };
  return { axes, headline: headline(axes), label: `${n}-Back`, timeMs };
}

// ---- Rang buoc bien cho telemetry tho (chong gia mao tu DevTools) ----
// Khong the chung minh tuyet doi, nhung chan duoc cac gia tri phi ly.
// San THONG KE: mau nhanh hon nguong nay bi loai khoi median/CV (statSamples),
// nhung KHONG lam hong ca van — xem HARD_MIN_RT_MS.
const MIN_RT_MS = 120;
// San CUNG: chi duoi nguong nay moi la phi nhan loai that su va bi tu choi.
// Khop HUMAN_FLOOR_MS trong anticheat.ts.
const HARD_MIN_RT_MS = 80;
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
    if (r < HARD_MIN_RT_MS)
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
