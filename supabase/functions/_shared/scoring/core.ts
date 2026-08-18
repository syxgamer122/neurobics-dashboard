import { TELEMETRY_SCHEMA_VERSION } from "../../../src/app/lib/telemetry-version.ts";
import { HUMAN_FLOOR_MS } from "../limits.ts";
// Canonical server-side game ids. SQL constraints remain explicit by design.

/**
 * SCORER_VERSIONS — Tăng khi đổi công thức chấm điểm (axis weights, clamping,
 * difficulty multipliers) của một game cụ thể.
 * Mọi training_session lưu version này để phân biệt dữ liệu cũ.
 */
export const SCORER_VERSIONS: Record<string, number> = {
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
  search: 1
};

/**
 * TELEMETRY_SCHEMA_VERSION — Tăng khi thay đổi cấu trúc payload telemetry mà
 * client gửi lên (thêm/bỏ field, đổi kiểu dữ liệu). Offline rounds mang theo
 * version này để server biết cách parse.
 *
 * Changelog:
 *   v1 — Schema gốc cho tất cả 12 games.
 */


export const GAME_IDS = [
  "schulte",
  "sudoku",
  "stroop",
  "reaction",
  "memory",
  "nback",
  "math",
  "gonogo",
  "mental",
  "corsi",
  "trail",
  "search",
] as const;

export type Game = (typeof GAME_IDS)[number];

const GAME_SET: ReadonlySet<string> = new Set(GAME_IDS);

export function isGame(value: unknown): value is Game {
  return typeof value === "string" && GAME_SET.has(value);
}

export type GameStatus = "active" | "internal" | "disabled";

export const GAME_STATUS: Record<Game, GameStatus> = {
  schulte: "active",
  sudoku: "active",
  stroop: "active",
  reaction: "active",
  memory: "active",
  nback: "active",
  math: "active",
  gonogo: "active",
  mental: "active",
  corsi: "active",
  trail: "active",
  search: "active",
};

export function getGameStatus(game: Game): GameStatus {
  return GAME_STATUS[game];
}
/**
 * Telemetry THO do client gui len — tuyet doi khong duoc tin.
 *
 * Co tinh de la Record<string, unknown> chu khong phai `any`: moi truong doc ra
 * deu la `unknown`, nen buoc phai di qua finite() / int() / numberArray() /
 * Number() moi dung duoc. `any` thi doc bua kieu gi cung qua, va do chinh la
 * cach mot truong go sai (vd. t.wrongClick thay vi t.wrongClicks) lot xuong
 * production duoi dang diem sai — khong he bao loi.
 */
export type Telemetry = Record<string, unknown>;

/** Chuan hoa payload tho thanh Telemetry. null / mang / so -> {} de moi truong
 *  doc ra la undefined, roi finite()/int() nem loi nhu cu. */
export const asTelemetry = (v: unknown): Telemetry =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Telemetry)
    : {};

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

export const NO_AXES: AxisRatings = {
  speed: null,
  focus: null,
  spatial: null,
  logic: null,
  memory: null,
};
export const MAX = 1000;
export const clamp = (n: number) => { if (!Number.isFinite(n) || isNaN(n)) return 0; return Math.max(0, Math.min(MAX, Math.round(n))); };
export const clamp01 = (n: number) => { if (!Number.isFinite(n) || isNaN(n)) return 0; return Math.max(0, Math.min(1, n)); };
export const finite = (
  n: unknown,
  name: string,
  min = 0,
  max = 7_200_000,
): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Error(`Invalid ${name}`);
  return v;
};

export function assertFiniteScore(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    throw new Error(`Invalid score: ${name}`);
  }
  return value;
}
export const int = (n: unknown, name: string, min = 0, max = 10_000) =>
  Math.round(finite(n, name, min, max));
export const numberArray = (
  v: unknown,
  name: string,
  minLength: number,
  maxLength: number,
): number[] => {
  if (!Array.isArray(v) || v.length < minLength || v.length > maxLength)
    throw new Error(`Invalid ${name} length`);
  // Lần nhập đầu tiên có thể bằng 0ms nếu xảy ra trong cùng một clock tick.
  // Chuẩn hóa thành 1ms thay vì từ chối toàn bộ kết quả ván.
  return v.map((x, i) => Math.max(1, finite(x, `${name}[${i}]`, 0, 3_600_000)));
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
 * soft flag), con hard-reject chi xay ra duoi HUMAN_FLOOR_MS.
 */
export const MIN_RT_MS = 120;

export const statSamples = (rts: number[], thresholdMs = 80): number[] =>
  withoutStartArtifact(rts, thresholdMs).filter((r) => r >= MIN_RT_MS);

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) =>
  xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const MIN_CV_SAMPLES = 10;
export const cv = (xs: number[]): number | null => {
  if (xs.length < MIN_CV_SAMPLES) return null;
  const m = mean(xs);
  if (m <= 0) return null;
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
/**
 * Ty le co tran cung. Chi con dung o nhung cho CAN mot he so <= 1.15 tuyet doi
 * (Schulte spatial), khong dung cho truc Speed nua — xem `speed` ben duoi.
 */
export const ratio = (target: number, actual: number) =>
  Math.min(target / Math.max(actual, 1), RATIO_CAP);

/**
 * v54 — BO BAO HOA TRUC SPEED.
 *
 * Cong thuc cu: speed = MAX * diff * min(target / median, 1.15).
 * Vi tran ratio la 1.15, MOI cau hinh co diff > 1 / 1.15 = 0.8696 deu bao hoa
 * o dung 1000: Trail B (diff 0.95, target 1100) cham 1000 tu 957ms tro xuong,
 * nen 950ms va 600ms duoc cham y nhu nhau; Reaction bao hoa tu 266ms; Go/No-Go
 * tu 369ms. Sau moc do, choi nhanh hon KHONG con duoc ghi nhan.
 *
 * Cong thuc moi tach hai nhanh quanh moc target:
 *  - Cham hon target: phat theo luy thua SPEED_SUB_EXP > 1, de phan giai ro
 *    vung yeu. Cu la tuyen tinh nen 420ms o Reaction (ro rang cham) van 633.
 *  - Nhanh hon target: lap dan khoang trong giua MAX * diff va MAX theo log,
 *    va chi lap toi da SPEED_FILL_MAX. Nho vay diem LUON don dieu tang theo
 *    toc do va khong bao gio phang, cung khong bao gio dat dung MAX.
 */
/** Do loi khi cham hon target. > 1 = phat nang hon tuyen tinh. */
const SPEED_SUB_EXP = 1.3;
/** Toc do lap khoang trong khi vuot target. Cang lon cang de tien gan MAX. */
const SPEED_FILL_RATE = 1.6;
/** Phan khoang trong toi da duoc lap. 0.85 => tran thuc te luon duoi MAX. */
const SPEED_FILL_MAX = 0.85;
export const speed = (
  rts: number[],
  target: number,
  diff: number,
  fallback?: number,
) => {
  const m = rts.length ? median(rts) : (fallback ?? 0);
  if (m <= 0) return 0;
  const raw = target / Math.max(m, 1);
  const base = MAX * diff;
  if (raw <= 1) return clamp(base * Math.pow(raw, SPEED_SUB_EXP));
  const fill = 1 - Math.exp(-Math.log(raw) * SPEED_FILL_RATE);
  return clamp(base + (MAX - base) * fill * SPEED_FILL_MAX);
};
// Focus: phat CV som hon (0.18 thay 0.25) va nang hon (0.75 thay 0.6).
// He so 0.92 de choi "deu + dung" van kho full 1000 neu diff < 1.
// Phân vị 20 và 95 của CV thời lượng phiên, đo trên cohort beta (n=4.2k, 2026-Q1).
// Cần đo lại nếu phân phối thời lượng phiên thay đổi đáng kể.
// Phân vị 20 và 95 của CV thời lượng phiên, đo trên cohort beta (n=4.2k, 2026-Q1).
// Cần đo lại nếu phân phối thời lượng phiên thay đổi đáng kể.
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
export const focus = (
  rts: number[],
  accuracy: number,
  diff: number,
  paceTargetMs?: number | null,
) => {
  const c = cv(rts);
  const penalty = c === null ? 0 : clamp01(
    (c - FOCUS_CV_OK) / (FOCUS_CV_BAD - FOCUS_CV_OK),
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
export const headline = (axes: AxisRatings) => {
  const vals = Object.values(axes).filter((v): v is number => v !== null);
  if (!vals.length) return 0;
  
  // Empirical Bayes / Shrinkage
  // Average population prior (e.g., 500)
  const PRIOR = 500;
  let total = 0;
  for (const key in axes) {
    const val = (axes as any)[key];
    total += val !== null ? val : PRIOR;
  }
  return clamp(total / 5);
};
