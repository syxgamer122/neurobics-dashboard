/**
 * Neurobics scoring model — single source of truth.
 *
 * Two design rules drive this file:
 *
 * 1. EVERY AXIS HAS ITS OWN FORMULA AND ITS OWN INPUT SIGNAL.
 *    Previously one round produced a single `rating` that was written to 2–3
 *    axes at once, so Logic/Memory/Speed were literally the same number and the
 *    radar converged to a circle. Now each axis consumes a different statistic:
 *
 *      Speed   ← median response time        (central tendency of pace)
 *      Focus   ← RT variability + lapses     (consistency, pace-normalized)
 *      Spatial ← late-phase search time      (scanning a depleted grid)
 *      Logic   ← deduction accuracy          (NO time term at all)
 *      Memory  ← board-state retention errors (NO time term at all)
 *
 *    Logic and Memory are deliberately time-free so a fast player cannot lift
 *    all five axes at once just by being quick.
 *
 * 2. BRAIN AGE IS ANCHORED TO REAL AGE AND REAL PEERS.
 *    It is `realAge - advantage`, where advantage comes from the player's
 *    percentile against the actual population in `profiles`. There is no
 *    hard-coded "baseline 38". Ratings also decay while inactive, so the number
 *    reflects current form instead of an all-time personal best.
 */

// ─── Scale ───────────────────────────────────────────────────────────────

export const RATING_MIN = 0;
export const RATING_MAX = 1000;

export const clampRating = (n: number): number =>
  Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(n)));

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Auto-heals legacy data. Pre-model accounts hold cumulative totals (e.g. 4200)
 * that would pin an axis at 100% forever. Anything outside the valid range is
 * treated as un-baselined and read as 0.
 */
export function sanitizeRating(val: number | null | undefined): number {
  if (typeof val !== "number" || !Number.isFinite(val) || val < RATING_MIN || val > RATING_MAX) {
    return 0;
  }
  return val;
}

// ─── Rating movement ────────────────────────────────────────────────────

/** How much of the gap to a better round is absorbed into the stored rating. */
export const EMA_ALPHA = 0.4;

/**
 * Upward-only moving average: a strong round pulls the rating up by EMA_ALPHA
 * of the gap, a weak round leaves it untouched. Decay (below) is what brings it
 * back down — not bad rounds, so one off day never wipes out months of work.
 */
/** Khoảng cách còn lại đủ nhỏ thì nhảy thẳng, tránh tiệm cận mãi ở 999. */
export const PULL_UP_SNAP = 3;

export function pullUpRating(prev: number | null | undefined, round: number): number {
  const o = sanitizeRating(prev);
  if (round <= o) return o;
  if (round - o <= PULL_UP_SNAP) return clampRating(round);
  return clampRating(Math.max(o + 1, o + EMA_ALPHA * (round - o)));
}

// ─── Inactivity decay ──────────────────────────────────────────────────

/** Days of inactivity tolerated before any decay applies. */
export const DECAY_GRACE_DAYS = 7;
/** Fraction of the rating lost per full week of inactivity past the grace period. */
export const DECAY_PER_WEEK = 0.02;
/** Decay asymptote — skill is never assumed to fall below this share of peak. */
export const DECAY_FLOOR_RATIO = 0.35;

const DAY_MS = 86_400_000;

/** Whole days between an ISO `YYYY-MM-DD` date and now. Negative clamps to 0. */
export function daysSince(isoDate: string | null | undefined, now: Date = new Date()): number {
  if (!isoDate) return 0;
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/**
 * Applies inactivity decay to one axis. This is what makes "brain age" a real
 * measurement instead of a trophy: stop training and the number drifts back.
 * Bounded by DECAY_FLOOR_RATIO so a long break never erases a player entirely.
 */
export function decayRating(value: number, idleDays: number): number {
  const v = sanitizeRating(value);
  if (v <= 0 || idleDays <= DECAY_GRACE_DAYS) return v;
  const weeks = (idleDays - DECAY_GRACE_DAYS) / 7;
  const decayed = v * Math.pow(1 - DECAY_PER_WEEK, weeks);
  return clampRating(Math.max(decayed, v * DECAY_FLOOR_RATIO));
}

// ─── Small stats helpers ───────────────────────────────────────────────

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Coefficient of variation (sd / mean). Scale-free, so a slow-but-metronomic
 * player scores the same consistency as a fast-but-metronomic one. This is what
 * lets Focus be independent of Speed.
 */
export function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  if (m <= 0) return 0;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance) / m;
}

/** Share of responses that took far longer than usual — i.e. attention lapses. */
export function lapseRate(xs: number[], threshold = 2.5): number {
  if (xs.length < 3) return 0;
  const med = median(xs);
  if (med <= 0) return 0;
  return xs.filter((x) => x > med * threshold).length / xs.length;
}

/** Bounded reward for beating a target time. */
export const TIME_RATIO_CAP = 1.4;
export const timeRatio = (targetMs: number, actualMs: number): number =>
  Math.min(targetMs / Math.max(actualMs, 1), TIME_RATIO_CAP);

// ─── Difficulty ceilings ───────────────────────────────────────────────
// The share of RATING_MAX reachable at a given difficulty. Grinding the easiest
// level can never max an axis.

export const SCHULTE_DIFF_FACTOR: Record<number, number> = { 9: 0.55, 16: 0.72, 25: 0.86, 36: 1.0 };
export const SUDOKU_DIFF_FACTOR: Record<string, number> = {
  Easy: 0.5, Medium: 0.6, Hard: 0.7, Expert: 0.8, Master: 0.9, Extreme: 1.0,
};
export const STROOP_DIFF_FACTOR = 0.82;

/** Per-target time budget (ms) for Schulte, by cell count. */
export const SCHULTE_TARGETS: Record<number, number> = { 9: 20000, 16: 45000, 25: 90000, 36: 160000 };
/** Whole-board time budget (ms) for Sudoku, by difficulty. */
export const SUDOKU_TARGETS: Record<string, number> = {
  Easy: 240000, Medium: 360000, Hard: 480000, Expert: 720000, Master: 960000, Extreme: 1500000,
};
/** Per-stimulus time budget (ms) for Stroop. */
export const STROOP_TARGET_PER_TRIAL = 1800;

export const SUDOKU_MAX_MISTAKES = 3;

// ─── Telemetry captured by each game ──────────────────────────────────────

export type SchulteTelemetry = {
  timeMs: number;
  cells: number;
  wrongClicks: number;
  /** Time in ms taken for each successful find, in order. */
  hitRts: number[];
  modeLabel: string;
};

export type SudokuTelemetry = {
  timeMs: number;
  difficulty: string;
  mistakes: number;
  /** Correct digits the player placed (excludes given clues). */
  placements: number;
  /** Time in ms between successive correct placements. */
  moveRts: number[];
  /** Overwriting a cell the player had already filled correctly. */
  reEntries: number;
  /** Entering a wrong digit into a cell that was already wrong once before. */
  repeatMistakes: number;
};

export type StroopTelemetry = {
  timeMs: number;
  totalStimuli: number;
  wrongClicks: number;
  /** Time in ms for each correct response. */
  rts: number[];
};

/** A round's contribution to the five axes. `null` = this game does not measure it. */
export type AxisRatings = {
  speed: number | null;
  focus: number | null;
  spatial: number | null;
  logic: number | null;
  memory: number | null;
};

const NO_AXES: AxisRatings = { speed: null, focus: null, spatial: null, logic: null, memory: null };

// ─── Shared axis kernels ───────────────────────────────────────────────

/**
 * SPEED — driven by the MEDIAN response time, not total elapsed time. A single
 * long pause (phone rang) barely moves the median, so this measures habitual
 * pace rather than whether the session was interrupted.
 */
function speedAxis(rts: number[], targetPerItemMs: number, diffFactor: number, fallbackMs?: number): number {
  const m = rts.length > 0 ? median(rts) : (fallbackMs ?? 0);
  if (m <= 0) return 0;
  return clampRating(RATING_MAX * diffFactor * timeRatio(targetPerItemMs, m));
}

/**
 * FOCUS — sustained attention, deliberately pace-normalized.
 * Built from the coefficient of variation (rhythm), the lapse rate (moments of
 * drifting off), and error rate. Because CV is scale-free, playing faster does
 * NOT raise Focus; only playing *evenly and cleanly* does.
 */
/** CV dưới mốc này được coi là nhịp hoàn hảo — con người không thể đạt cv = 0. */
export const FOCUS_CV_FLOOR = 0.25;
/** CV từ mốc này trở lên chịu phạt tối đa. */
export const FOCUS_CV_CEILING = 1.2;

function focusAxis(rts: number[], accuracy: number, diffFactor: number): number {
  const cv = coefficientOfVariation(rts);
  // Chuẩn hóa lại: cv ≤ 0.25 → rhythm = 1.0 (đạt trần được).
  // Trước đây yêu cầu cv = 0, tức là bất khả thi, nên Focus vĩnh viễn kẹt ~0.83.
  const rhythmPenalty = clamp01(
    (cv - FOCUS_CV_FLOOR) / (FOCUS_CV_CEILING - FOCUS_CV_FLOOR),
  );
  const rhythm = 1 - rhythmPenalty * 0.6;
  const attention = 1 - lapseRate(rts);
  return clampRating(RATING_MAX * diffFactor * rhythm * attention * accuracy);
}
// ─── Schulte → Spatial, Focus, Speed ───────────────────────────────────────
// Schulte is a visual-search task. It says nothing about deduction or recall,
// so Logic and Memory stay null here.

export function scoreSchulte(tm: SchulteTelemetry): AxisRatings {
  const { timeMs, cells, wrongClicks, hitRts } = tm;
  const diff = SCHULTE_DIFF_FACTOR[cells] ?? 0.7;
  const totalTarget = SCHULTE_TARGETS[cells] ?? 90000;
  const perItemTarget = totalTarget / Math.max(cells, 1);
  const accuracy = cells / (cells + Math.max(0, wrongClicks));

  // SPATIAL — the LATE phase only. Early finds are easy (numbers are everywhere);
  // the real spatial work is locating the last few targets in a depleted grid,
  // which rewards a systematic scan pattern rather than raw reaction speed.
  const lateStart = Math.floor(hitRts.length * (2 / 3));
  const lateRts = hitRts.slice(lateStart);
  const lateMedian = lateRts.length > 0 ? median(lateRts) : timeMs / Math.max(cells, 1);
  // Late finds are expected to be slower, so the budget is widened by 1.6×.
  const spatial = clampRating(
    RATING_MAX * diff * timeRatio(perItemTarget * 1.6, lateMedian) * accuracy,
  );

  return {
    ...NO_AXES,
    speed: speedAxis(hitRts, perItemTarget, diff, timeMs / Math.max(cells, 1)),
    focus: focusAxis(hitRts, accuracy, diff),
    spatial,
  };
}

// ─── Sudoku → Logic, Memory, Speed ─────────────────────────────────────────
// Sudoku has no visual-search component worth scoring and no sustained-attention
// signal that is not confounded with thinking time, so Spatial and Focus are null.

export function scoreSudoku(tm: SudokuTelemetry): AxisRatings {
  const { timeMs, difficulty, mistakes, placements, moveRts, reEntries, repeatMistakes } = tm;
  const diff = SUDOKU_DIFF_FACTOR[difficulty] ?? 0.7;
  const totalTarget = SUDOKU_TARGETS[difficulty] ?? 480000;
  const perMoveTarget = totalTarget / Math.max(placements, 1);

  // LOGIC — pure deduction quality, with NO time term. Taking an hour to solve an
  // Extreme board flawlessly is a logic success, and this axis says so. Speed is
  // measured separately; conflating the two is what made every axis move together.
  const deduction = 1 - clamp01(mistakes / SUDOKU_MAX_MISTAKES);
  const logic = clampRating(RATING_MAX * diff * deduction);

  // MEMORY — board-state retention, also time-free. Two distinct failure modes:
  //   reEntries      = overwriting a cell you had already solved (lost the board)
  //   repeatMistakes = retrying a digit already proven wrong in that cell
  //                    (failed to retain an eliminated candidate)
  // Budget scales with board size so a bigger puzzle is not unfairly punished.
  const retentionBudget = Math.max(4, placements * 0.25);
  const retention = 1 - clamp01((reEntries + repeatMistakes * 1.5) / retentionBudget);
  const memory = clampRating(RATING_MAX * diff * retention);

  return {
    ...NO_AXES,
    speed: speedAxis(moveRts, perMoveTarget, diff, timeMs / Math.max(placements, 1)),
    logic,
    memory,
  };
}

// ─── Stroop → Focus, Speed ───────────────────────────────────────────────
// Stroop measures interference control. It is not a spatial, logic, or memory
// task, so it writes to exactly two axes.

export function scoreStroop(tm: StroopTelemetry): AxisRatings {
  const { timeMs, totalStimuli, wrongClicks, rts } = tm;
  const completion = rts.length / Math.max(1, totalStimuli);
  const accuracy =
    (rts.length / Math.max(1, rts.length + Math.max(0, wrongClicks))) * completion;

  return {
    ...NO_AXES,
    speed: speedAxis(rts, STROOP_TARGET_PER_TRIAL, STROOP_DIFF_FACTOR, timeMs / Math.max(rts.length, 1)),
    focus: focusAxis(rts, accuracy, STROOP_DIFF_FACTOR),
  };
}
// ─── Reaction Time → Speed, Focus ─────────────────────────────────────────
// Reaction Time đo tốc độ phản ứng trực tiếp. Focus được tính từ độ ổn định
// giữa các lượt và bị giảm nếu người chơi bấm sớm.

export const REACTION_TARGET_MS = 350;
export const REACTION_DIFF_FACTOR = 1.0;
export const REACTION_FOCUS_FACTOR = 0.9;

export type ReactionTelemetry = {
  timeMs: number;
  rts: number[];
  falseStarts: number;
};

export function scoreReaction(tm: ReactionTelemetry): AxisRatings {
  const validTrials = tm.rts.length;

  if (validTrials === 0) {
    return { ...NO_AXES };
  }

  const accuracy =
    validTrials / (validTrials + Math.max(0, tm.falseStarts));

  return {
    ...NO_AXES,

    // Tốc độ dựa trên trung vị của các lượt, để một lượt quá chậm không
    // làm hỏng toàn bộ kết quả.
    speed: speedAxis(
      tm.rts,
      REACTION_TARGET_MS,
      REACTION_DIFF_FACTOR,
    ),

    // Focus dựa trên độ ổn định giữa các lượt và số lần bấm sớm.
    focus: focusAxis(
      tm.rts,
      accuracy,
      REACTION_FOCUS_FACTOR,
    ),
  };
}
// ─── Memory Matrix → Memory, Spatial ─────────────────────────────────────
// Người chơi ghi nhớ một tập ô sáng rồi tái tạo lại: đây là tác vụ working
// memory có thành phần không gian. Không có bước suy luận (Logic = null), và
// đồng hồ bị chi phối bởi thời gian hiển thị cố định của pha memorize/recall
// chứ không phải nhịp chơi — nên Speed và Focus để null thay vì bịa ra từ một
// tín hiệu thời gian đã bị nhiễu.

/** Level được coi là đạt trình độ thành thục — tới đây thì số hạng level bão hòa. */
export const MEMORY_TARGET_LEVEL = 12;
export const MEMORY_DIFF_FACTOR = 0.9;
/** Spatial chỉ là tín hiệu phụ của game này nên trần thấp hơn Memory. */
export const MEMORY_SPATIAL_FACTOR = 0.7;

export type MemoryTelemetry = {
  timeMs: number;
  maxLevel: number;
  wrongClicks: number;
};

export function scoreMemory(tm: MemoryTelemetry): AxisRatings {
  const level = Math.max(0, tm.maxLevel);
  if (level <= 0) return { ...NO_AXES };

  // Đi được bao xa trên đường cong độ khó, bão hòa tại mốc thành thục.
  const progression = clamp01(level / MEMORY_TARGET_LEVEL);

  // Xấp xỉ số ô phải tái tạo trong cả lượt chơi. Game tăng số ô mục tiêu theo
  // 2 + floor(level / 1.5), nên ~3 ô mỗi level là ước lượng hợp lý.
  const cellsShown = Math.max(1, Math.round(level * 3));
  const accuracy = cellsShown / (cellsShown + Math.max(0, tm.wrongClicks));

  return {
    ...NO_AXES,
    // MEMORY — khả năng lưu giữ, cố tình không dùng thời gian, giống trục
    // memory của Sudoku.
    memory: clampRating(RATING_MAX * MEMORY_DIFF_FACTOR * progression * accuracy),
    // SPATIAL — nhớ các ô đó Ở ĐÂU. Cùng tín hiệu nhưng trần thấp hơn, vì lưới
    // được hiện ra sẵn chứ người chơi không phải tìm kiếm.
    spatial: clampRating(RATING_MAX * MEMORY_SPATIAL_FACTOR * progression * accuracy),
  };
}

/** Headline number shown on the round overlay: the best axis earned this round. */
export function roundHeadline(axes: AxisRatings): number {
  const vals = Object.values(axes).filter((v): v is number => v !== null);
  return vals.length === 0 ? 0 : Math.max(...vals);
}

// ─── Brain age ────────────────────────────────────────────────────────

/** Rounds required before a brain age is shown at all. */
export const CALIBRATION_ROUNDS = 5;
/** Maximum years a player can be shifted from their real age, in either direction. */
export const MAX_AGE_SWING = 12;

/** Aggregate stats over the real user base, used instead of a hard-coded baseline. */
export type PopulationStats = {
  mean: number;
  sd: number;
  /** Number of calibrated players the stats are based on. */
  n: number;
};

/** Fallback used until enough players have calibrated to form a real distribution. */
export const DEFAULT_POPULATION: PopulationStats = { mean: 380, sd: 180, n: 0 };
/** Below this many peers the distribution is too thin to rank against. */
export const MIN_POPULATION = 8;

/** Abramowitz & Stegun 7.1.26 error-function approximation. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t *
    Math.exp(-ax * ax);
  return sign * y;
}

/** Share of the population a given cognitive index beats, in [0, 1]. */
export function percentileOf(index: number, pop: PopulationStats): number {
  const sd = pop.sd > 1 ? pop.sd : 1;
  const z = (index - pop.mean) / sd;
  return clamp01(0.5 * (1 + erf(z / Math.SQRT2)));
}

export type BrainAgeResult =
  | { status: "needs_age" }
  | { status: "calibrating"; roundsPlayed: number; roundsNeeded: number }
  | {
    status: "ready";
    age: number;
    realAge: number;
    /** Years younger than real age. Negative = older. */
    delta: number;
    percentile: number;
    /** 0–1 fill for the dial. */
    ringPct: number;
    /** True while ranked against the seed distribution rather than real peers. */
    provisional: boolean;
  };

export type BrainAgeInput = {
  cognitiveIndex: number;
  birthYear: number | null | undefined;
  roundsPlayed: number;
};

/**
 * Brain age = the player's real age, shifted by how they rank against actual
 * peers. Someone who is 55 and outperforms 90% of users is told they are ~43,
 * not "18" — the number now means something relative to their own life stage.
 */
export function calcBrainAge(
  { cognitiveIndex, birthYear, roundsPlayed }: BrainAgeInput,
  pop: PopulationStats = DEFAULT_POPULATION,
  now: Date = new Date(),
): BrainAgeResult {
  if (!birthYear || !Number.isFinite(birthYear)) return { status: "needs_age" };

  if (roundsPlayed < CALIBRATION_ROUNDS) {
    return { status: "calibrating", roundsPlayed, roundsNeeded: CALIBRATION_ROUNDS };
  }

  const realAge = Math.max(5, Math.min(120, now.getFullYear() - birthYear));
  const percentile = percentileOf(cognitiveIndex, pop);

  // Centre the percentile so the median player sits exactly at their real age.
  const advantage = (percentile - 0.5) * 2 * MAX_AGE_SWING;
  const age = Math.round(Math.max(5, Math.min(120, realAge - advantage)));

  return {
    status: "ready",
    age,
    realAge,
    delta: realAge - age,
    percentile,
    ringPct: percentile,
    provisional: pop.n < MIN_POPULATION,
  };
}
