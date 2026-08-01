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
/**
 * Sai so lam tron duoc THA THU: mot ban ghi 1001 gan nhu chac chan la loi
 * rounding chu khong phai du lieu legacy kieu tich luy (4200). Truoc day moi
 * gia tri > 1000 deu bi coi la legacy va xoa trang truc do, tuc mot bug lam
 * tron 1 diem lam mat sach ca truc. Gio chi kep xuong tran.
 */
export const RATING_TOLERANCE = 1.05;

export function sanitizeRating(val: number | null | undefined): number {
  if (typeof val !== "number" || !Number.isFinite(val) || val < RATING_MIN) {
    return 0;
  }
  // Vuot tran mot chut => kep ve 1000. Vuot xa => du lieu tien-model, doc la 0.
  if (val > RATING_MAX) {
    return val <= RATING_MAX * RATING_TOLERANCE ? RATING_MAX : 0;
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

/**
 * Whole days between an ISO `YYYY-MM-DD` date and now. Negative clamps to 0.
 *
 * `last_active_date` duoc ghi bang vnDateString() — tuc NGAY LICH Viet Nam
 * (UTC+7). Neu parse moc do o UTC thi decay va streak dung hai dinh nghia
 * "ngay" khac nhau, lech toi 7 gio. Parse ca hai dau o +07:00 cho thong nhat.
 */
export const VN_UTC_OFFSET = "+07:00";

export function daysSince(isoDate: string | null | undefined, now: Date = new Date()): number {
  if (!isoDate) return 0;
  const then = Date.parse(`${isoDate}T00:00:00${VN_UTC_OFFSET}`);
  if (!Number.isFinite(then)) return 0;
  // Quy "bay gio" ve dau ngay lich VN de hieu so luon la so ngay tron.
  const nowVnYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(now);
  const nowVnMidnight = Date.parse(`${nowVnYmd}T00:00:00${VN_UTC_OFFSET}`);
  if (!Number.isFinite(nowVnMidnight)) return 0;
  return Math.max(0, Math.round((nowVnMidnight - then) / DAY_MS));
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

// ─── Telemetry captured by each game ──────────────────────────────────────

export type SchulteTelemetry = {
  timeMs: number;
  cells: number;
  wrongClicks: number;
  /** Time in ms taken for each successful find, in order. */
  hitRts: number[];
  modeLabel: string;
  /**
   * true khi thua het tim. Van thua dung giua chung nen hitRts NGAN hon cells;
   * server chi chap nhan hitRts.length < cells khi co co nay (khong co no thi
   * moi van Schulte thua deu bi tra ve 400 "Invalid hitRts length").
   */
  failed?: boolean;
  /** Tong so o cua de (= cells). Giu lai de server biet muc do hoan thanh. */
  intendedCells?: number;
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
  /**
   * Do tre cua cac nuoc SAI, tach rieng khoi moveRts. Nuoc sai thuong la bam
   * au va rat nhanh; de lan vao moveRts se keo median xuong va thuong nham
   * diem Speed cho nguoi bam bua.
   */
  wrongMoveRts?: number[];
  /** true khi thua het mang — van submit de ghi streak/quest/ticket. */
  failed?: boolean;
  /** So o de lo THUC TE cua de nay (>= muc chuan neu generator het budget). */
  actualClues?: number;
  /** true khi de bi cat dao som => de hon nhan do kho, server ha he so. */
  budgetExceeded?: boolean;
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
/**
 * FOCUS — sustained attention, deliberately pace-normalized.
 * Built from the coefficient of variation (rhythm), the lapse rate (moments of
 * drifting off), and error rate. Because CV is scale-free, playing faster does
 * NOT raise Focus; only playing *evenly and cleanly* does.
 */
// ─── Schulte → Spatial, Focus, Speed ───────────────────────────────────────
// Schulte is a visual-search task. It says nothing about deduction or recall,
// so Logic and Memory stay null here.

// ─── Sudoku → Logic, Memory, Speed ─────────────────────────────────────────
// Sudoku has no visual-search component worth scoring and no sustained-attention
// signal that is not confounded with thinking time, so Spatial and Focus are null.

// ─── Stroop → Focus, Speed ───────────────────────────────────────────────
// Stroop measures interference control. It is not a spatial, logic, or memory
// task, so it writes to exactly two axes.

// ─── Reaction Time → Speed, Focus ─────────────────────────────────────────
// Reaction Time đo tốc độ phản ứng trực tiếp. Focus được tính từ độ ổn định
// giữa các lượt và bị giảm nếu người chơi bấm sớm.

export type ReactionTelemetry = {
  timeMs: number;
  rts: number[];
  falseStarts: number;
};

// ─── Memory Matrix → Memory, Spatial ─────────────────────────────────────
// Người chơi ghi nhớ một tập ô sáng rồi tái tạo lại: đây là tác vụ working
// memory có thành phần không gian. Không có bước suy luận (Logic = null), và
// đồng hồ bị chi phối bởi thời gian hiển thị cố định của pha memorize/recall
// chứ không phải nhịp chơi — nên Speed và Focus để null thay vì bịa ra từ một
// tín hiệu thời gian đã bị nhiễu.

export type MemoryTelemetry = {
  timeMs: number;
  /**
   * Cap cao nhat DA VUOT QUA. Truoc day client gui Math.max(1, ...) nen thua
   * ngay cap 1 (chua nho noi o nao) van duoc tinh nhu da qua cap 1.
   */
  maxLevel: number;
  /** So cap thuc su hoan thanh — 0 khi thua ngay cap dau. */
  clearedLevels?: number;
  /** true khi het tim. */
  failed?: boolean;
  wrongClicks: number;
};

// ─── N-Back → Memory, Focus (+Speed phu) ───────────────────────────────
// Người chơi phải giữ trong đầu N ô gần nhất và liên tục cập nhật — đây là bài
// working memory kinh điển. Chỉ bấm đúng thôi chưa đủ: bấm bừa (false alarm) bị
// trừ nặng, giống cách d-prime phạt đoán mò.
// ─── Math Sprint ────────────────────────────────────────────────────────
export type MathDifficulty = "easy" | "medium" | "hard";

export type MathTelemetry = {
  timeMs: number;
  difficulty: MathDifficulty;
  totalProblems: number;
  correct: number;
  wrong: number;
  /** Độ trễ từng câu (cả đúng lẫn sai), theo thứ tự. */
  rts: number[];
};

export type NBackTelemetry = {
  timeMs: number;
  /** Mức N đang chơi (2-back, 3-back...). */
  n: number;
  /** Tổng số lượt hiển thị. */
  trials: number;
  /** Bắt đúng lúc trùng khớp. */
  hits: number;
  /** Trùng khớp nhưng bỏ lỡ. */
  misses: number;
  /** Bấm trong khi không hề trùng khớp. */
  falseAlarms: number;
  /** Độ trễ của những lần bắt đúng. */
  rts: number[];
};

/** Headline number shown on the round overlay: the best axis earned this round. */

// ─── Server is the only scorer ─────────────────────────────────────────
// Công thức chấm điểm (scoreSchulte/Sudoku/...) sống duy nhất ở
// supabase/functions/_shared/round-scoring.ts. Client chỉ giữ kiểu telemetry,
// pullUpRating (fallback UI), decayRating, và brain age.
// KHÔNG nhân đôi công thức ở đây — tránh lệch điểm client/server.

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
