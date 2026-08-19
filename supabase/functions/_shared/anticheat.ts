// Server-side anti-cheat inspectors.
// Principle: better to miss a cheater than ban an innocent player ("tha lot con hon bat oan").
// Hard flags reject the round. Soft flags still accept but record trust damage.
import { asTelemetry } from "./scoring/core.ts";
import type { Game, Telemetry } from "./scoring/core.ts";
//

/**
 * INSPECTOR_VERSION — Tăng khi thay đổi ngưỡng anti-cheat hoặc thêm quy tắc
 * kiểm tra mới. Lưu cùng training_session để khi re-audit biết dữ liệu được
 * chấm bởi bộ quy tắc nào.
 *
 * Changelog:
 *   v1 — Bộ inspector gốc: HUMAN_FLOOR_MS, ROBOT_CV=0.04, per-game thresholds.
 */
export const INSPECTOR_VERSIONS: Record<string, number> = {
  schulte: 1,
  sudoku: 1,
  stroop: 1,
  reaction: 1,
  memory: 1,
  nback: 1,
  math: 1,
  gonogo: 1,
  mental: 1,
  corsi: 1,
  trail: 1,
  search: 1,
};
export const SHARED_INSPECTOR_VERSION = 1;

export type SignalClass = "statistical" | "physical";

export type CheatFlag = {
  msg: string;
  signal_class: SignalClass;
  detail?: Record<string, unknown>;
};

export type CheatReport = {
  flags: CheatFlag[];
};

import { HUMAN_FLOOR_MS } from "./limits.ts";
const ROBOT_CV = 0.04;

const nums = (v: unknown): number[] =>
  Array.isArray(v)
    ? v.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
    : [];

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const cv = (xs: number[]): number => {
  if (xs.length < 10) return 1;
  const m = mean(xs);
  if (m <= 0) return 0;
  const sd = Math.sqrt(
    xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1),
  );
  return sd / m;
};

const flag = (
  msg: string,
  signal_class: SignalClass,
  detail?: Record<string, unknown>,
): CheatFlag => ({ msg, signal_class, detail });

function inspectShared(t: Telemetry, serverElapsedMs: number): CheatFlag[] {
  const out: CheatFlag[] = [];
  const timeMs = Number(t?.timeMs);
  if (Number.isFinite(timeMs) && timeMs - serverElapsedMs > 5000) {
    out.push(
      flag("Client time far exceeds server elapsed", "statistical", {
        timeMs,
        serverElapsedMs,
      }),
    );
  }
  return out;
}

function inspectReaction(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 3) return [];
  const out: CheatFlag[] = [];
  const min = Math.min(...rts);
  const med = median(rts);

  const clean = rts.filter((r) => r >= HUMAN_FLOOR_MS);
  const belowCount = rts.length - clean.length;
  if (belowCount >= 3 && belowCount / rts.length >= 0.4) {
    out.push(
      flag("Multiple reactions below human floor", "physical", {
        below: belowCount,
        total: rts.length,
      }),
    );
  } else if (belowCount > 0) {
    out.push(flag("Isolated sub-floor reaction", "statistical", { min }));
  }

  if (med < 130)
    out.push(flag("Reaction median impossibly low", "physical", { med }));
  const c = cv(rts);
  if (c !== null && c < ROBOT_CV)
    out.push(flag("Reaction timing too metronomic", "statistical", { cv: c }));
  return out;
}

function inspectSchulte(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.hitRts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 150)
    out.push(flag("Schulte hit median impossibly low", "physical", { med }));
  const c = cv(rts);
  if (c !== null && c < ROBOT_CV)
    out.push(flag("Schulte timing too metronomic", "statistical", { cv: c }));
  return out;
}

function inspectStroop(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 200)
    out.push(flag("Stroop median impossibly low", "physical", { med }));
  const c = cv(rts);
  if (c !== null && c < ROBOT_CV)
    out.push(flag("Stroop timing too metronomic", "statistical", { cv: c }));
  return out;
}

function inspectSudoku(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.moveRts);
  const out: CheatFlag[] = [];
  if (rts.length >= 5) {
    const med = median(rts);
    if (med < 120)
      out.push(flag("Sudoku move median impossibly low", "physical", { med }));
    const c = cv(rts);
    if (c !== null && c < ROBOT_CV)
      out.push(flag("Sudoku timing too metronomic", "statistical", { cv: c }));
  }
  const timeMs = Number(t?.timeMs);
  const diff = String(t?.difficulty ?? "");
  if (
    Number.isFinite(timeMs) &&
    (diff === "Master" || diff === "Extreme") &&
    timeMs < 45_000
  ) {
    out.push(
      flag("Sudoku expert board finished too fast", "statistical", {
        timeMs,
        diff,
      }),
    );
  }
  return out;
}

function inspectMemory(t: Telemetry): CheatFlag[] {
  const timeMs = Number(t?.timeMs);
  // Uu tien clearedLevels (so cap THUC SU vuot qua). maxLevel cu bi client nang
  // san len 1 nen van thua ngay cap 1 van bi chia cho 1.
  const rawCleared = Number(t?.clearedLevels);
  const cleared = Number.isFinite(rawCleared)
    ? rawCleared
    : Number(t?.maxLevel);

  if (!Number.isFinite(timeMs) || !Number.isFinite(cleared)) return [];
  // Chua vuot duoc cap nao => khong co "nhip do" de danh gia. Truoc day van nay
  // bi chia cho maxLevel=1 va reject 422 oan, nguoi choi mat streak/quest.
  if (cleared < 3) return [];

  // timeMs cua Memory la RECALL-ONLY (da tru pha memorize), nen nguong 1200ms
  // moi cap — dat tu thoi timeMs con la wall-clock ca van — la qua cao.
  // ~600ms cho moi cap la san hop ly cho rieng pha recall.
  const taps = Number(t?.totalTaps);
  const perTap = Number.isFinite(taps) && taps > 0 ? timeMs / taps : null;
  if (perTap !== null && perTap < 90)
    return [flag("Memory pace impossibly fast", "physical", { perTap })];
  return [];
}

/**
 * Mau 80-120ms: nhanh bat thuong nhung van trong tam nguoi that (bam
 * anticipation). Server khong con hard-reject ca van vi mot mau nhu vay — mau
 * do bi loai khoi thong ke ben round-scoring, con day chi ghi soft flag.
 */
function inspectSubThreshold(t: Telemetry, game: Game): CheatFlag[] {
  const RT_FIELD: Record<Game, string> = {
    schulte: "hitRts",
    sudoku: "moveRts",
    stroop: "rts",
    reaction: "rts",
    memory: "rts",
    nback: "rts",
    math: "rts",
    gonogo: "rts",
    mental: "rts",
    corsi: "rts",
    trail: "rts",
    search: "rts",
  };
  const field = RT_FIELD[game] || "rts";
  const rts = nums((t as any)?.[field] ?? t?.rts);
  if (!rts.length) return [];
  const borderline = rts.filter((r) => r >= HUMAN_FLOOR_MS && r < 120);
  const inhuman = rts.filter((r) => r > 0 && r < HUMAN_FLOOR_MS);
  const flags: CheatFlag[] = [];

  if (inhuman.length > 0) {
    flags.push({
      msg: `Inhuman reaction time (< ${HUMAN_FLOOR_MS}ms)`,
      signal_class: "statistical",
      detail: { count: inhuman.length, total: rts.length },
    });
  }

  // Mot vai mau thi binh thuong; qua nua so mau duoi 120ms moi dang ngo.
  const overHalf = borderline.length > rts.length / 2;
  if (overHalf) {
    flags.push({
      msg: "Unusually high number of reaction times under 120ms",
      signal_class: "statistical",
      detail: { count: borderline.length, total: rts.length },
    });
  }

  return flags;
}

function inspectNBack(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 3) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  if (med < 150)
    out.push(flag("N-Back median impossibly low", "physical", { med }));
  const c = cv(rts);
  if (c !== null && c < ROBOT_CV)
    out.push(flag("N-Back timing too metronomic", "statistical", { cv: c }));
  return out;
}

function inspectMath(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  if (rts.length < 4) return [];
  const out: CheatFlag[] = [];
  const med = median(rts);
  const correct = Number(t?.correct);
  const total = Number(t?.totalProblems);
  const difficulty = String(t?.difficulty ?? "");
  if (med < 250)
    out.push(flag("Math median impossibly low", "physical", { med }));
  const c = cv(rts);
  if (c !== null && c < ROBOT_CV)
    out.push(flag("Math timing too metronomic", "statistical", { cv: c }));
  if (
    difficulty === "physical" &&
    Number.isFinite(correct) &&
    Number.isFinite(total) &&
    correct === total &&
    med < 1200
  ) {
    out.push(
      flag("Perfect hard math finished too fast", "statistical", {
        med,
        correct,
      }),
    );
  }
  return out;
}

function inspectGoNoGo(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 3) {
    const med = median(rts);
    // Choice RT chậm hơn simple RT; median < 160ms gần như không thể.
    if (med < 160)
      out.push(flag("Go/No-Go median impossibly low", "physical", { med }));
    const c = cv(rts);
    if (c !== null && c < ROBOT_CV)
      out.push(
        flag("Go/No-Go timing too metronomic", "statistical", { cv: c }),
      );
  }
  const fa = Number(t?.falseAlarms);
  const hits = Number(t?.hits);
  const goTrials = Number(t?.goTrials);
  const nogoTrials = Number(t?.nogoTrials);
  // 0 FA + 100% hit trên mẫu đủ lớn: có thể thật nhưng ghi soft để theo dõi.
  if (
    Number.isFinite(fa) &&
    Number.isFinite(hits) &&
    Number.isFinite(goTrials) &&
    Number.isFinite(nogoTrials) &&
    nogoTrials >= 8 &&
    goTrials >= 16 &&
    fa === 0 &&
    hits === goTrials &&
    rts.length >= 12 &&
    median(rts) < 220
  ) {
    out.push(
      flag("Perfect inhibition with very fast Go RTs", "statistical", {
        med: median(rts),
        hits,
        fa,
      }),
    );
  }
  return out;
}

function inspectMental(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 4) {
    const med = median(rts);
    // So khớp hình 2D: median < 250ms gần như không đọc được hình.
    if (med < 250)
      out.push(
        flag("Mental Rotation median impossibly low", "physical", { med }),
      );
    const c = cv(rts);
    if (c !== null && c < ROBOT_CV)
      out.push(
        flag("Mental Rotation timing too metronomic", "statistical", { cv: c }),
      );
  }
  const correct = Number(t?.correct);
  const trials = Number(t?.trials);
  if (
    Number.isFinite(correct) &&
    Number.isFinite(trials) &&
    trials >= 16 &&
    correct === trials &&
    rts.length >= 12 &&
    median(rts) < 450
  ) {
    out.push(
      flag("Perfect mental rotation finished too fast", "statistical", {
        med: median(rts),
        correct,
        trials,
      }),
    );
  }
  return out;
}

function inspectCorsi(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 4) {
    const med = median(rts);
    // Phai nho lai vi tri roi moi cham: median < 180ms gan nhu khong the.
    if (med < 180)
      out.push(flag("Corsi tap median impossibly low", "physical", { med }));
    const c = cv(rts);
    if (c !== null && c < ROBOT_CV)
      out.push(flag("Corsi timing too metronomic", "statistical", { cv: c }));
  }
  const span = Number(t?.span);
  const trials = Number(t?.trials);
  // Span >= 8 la muc rat hiem. Dat duoc ma gan nhu khong truot luot nao thi
  // ghi soft de theo doi (van chap nhan — "tha lot con hon bat oan").
  if (
    Number.isFinite(span) &&
    Number.isFinite(trials) &&
    span >= 8 &&
    trials <= span
  ) {
    out.push(
      flag("Corsi span very high with too few trials", "statistical", {
        span,
        trials,
      }),
    );
  }
  return out;
}

function inspectTrail(t: Telemetry): CheatFlag[] {
  const rts = nums(t?.rts);
  const out: CheatFlag[] = [];
  if (rts.length >= 5) {
    const med = median(rts);
    // Moi buoc phai QUET tim diem tiep theo tren ban do: < 200ms la phi thuc te.
    if (med < 200)
      out.push(
        flag("Trail Making hop median impossibly low", "physical", { med }),
      );
    const c = cv(rts);
    if (c !== null && c < ROBOT_CV)
      out.push(
        flag("Trail Making timing too metronomic", "statistical", { cv: c }),
      );
  }
  const wrong = Number(t?.wrongClicks);
  const timeMs = Number(t?.timeMs);
  const nodes = Number(t?.nodes);
  if (
    Number.isFinite(wrong) &&
    Number.isFinite(timeMs) &&
    Number.isFinite(nodes) &&
    nodes >= 20 &&
    wrong === 0 &&
    timeMs < nodes * 260
  ) {
    out.push(
      flag("Perfect trail finished implausibly fast", "statistical", {
        timeMs,
        nodes,
      }),
    );
  }
  return out;
}

export const THRESHOLDS = {
  // Nguong phan xa cua con nguoi. Duoi muc nay chac chan la bot.
  humanFloorMs: {
    value: HUMAN_FLOOR_MS,
    unit: "ms",
    provenance: "Literature (Luce, 1986); empirical data from 10k users.",
  },
  // Nguong phu sai so (CV) cua bot. Robot the hien nhip do dieu dan < 4%.
  robotCv: {
    value: 0.04,
    unit: "ratio",
    provenance: "Empirical data from bot simulation scripts.",
  },
  // Diem (so luong cap hinh tim duoc) toi da mot nguoi co the dat trong van Search 60s.
  searchRawScoreLimit: {
    value: 80,
    unit: "pairs",
    provenance: "Empirical max pairs found by top 0.1% users in 60s.",
  },
};

function inspectSearch(t: Telemetry): CheatFlag[] {
  const flags: CheatFlag[] = [];
  const score = Number(t?.score);
  const rts = nums(t?.rts);
  if (score > THRESHOLDS.searchRawScoreLimit.value) {
    flags.push(
      flag("search: score exceeds human limits", "statistical", { score }),
    );
  }
  const c = cv(rts);
  if (rts.length >= 10 && c !== null && c < THRESHOLDS.robotCv.value) {
    flags.push(
      flag("search: mechanically steady pace (robot)", "statistical", {
        cv: c,
      }),
    );
  }
  return flags;
}

type GameInspector = (telemetry: Telemetry) => CheatFlag[];

/** Exhaustive registry: adding a Game without an inspector fails typecheck. */
const GAME_INSPECTORS = {
  schulte: inspectSchulte,
  sudoku: inspectSudoku,
  stroop: inspectStroop,
  reaction: inspectReaction,
  memory: inspectMemory,
  nback: inspectNBack,
  math: inspectMath,
  gonogo: inspectGoNoGo,
  mental: inspectMental,
  corsi: inspectCorsi,
  trail: inspectTrail,
  search: inspectSearch,
} satisfies Record<Game, GameInspector>;

export function inspectRound(
  game: Game,
  telemetry: unknown,
  serverElapsedMs: number,
  isOffline: boolean = false,
): CheatReport {
  const t = asTelemetry(telemetry);
  return {
    flags: [
      ...(isOffline ? [] : inspectShared(t, serverElapsedMs)),
      ...inspectSubThreshold(t, game),
      ...GAME_INSPECTORS[game](t),
    ],
  };
}

export function shouldReject(report: CheatReport): boolean {
  const physicals = report.flags.filter(
    (f) => f.signal_class === "physical",
  ).length;
  const statisticals = report.flags.filter(
    (f) => f.signal_class === "statistical",
  ).length;
  return physicals >= 1 || statisticals >= 2;
}

export function softFlags(report: CheatReport): CheatFlag[] {
  // Return flags that are statistical if we didn't reject, or maybe all of them
  return report.flags.filter((f) => f.signal_class === "statistical");
}
