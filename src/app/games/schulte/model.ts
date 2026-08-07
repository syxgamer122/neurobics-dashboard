import { shuffleArray } from "../../lib/sudoku-gen";

export type SchulteGameStatus = "idle" | "playing" | "done";
export type SchulteFlash = { idx: number; ok: boolean } | null;
export const MAX_SCHULTE_HEARTS = 3;

export type SchulteMode = "classic" | "reverse" | "dual";
export type SchulteSize = 3 | 4 | 5 | 6;
export interface SchulteCell {
  value: number;
  color: "cyan" | "red";
}

export function buildSchulteGrid(
  size: SchulteSize,
  mode: SchulteMode,
): SchulteCell[] {
  const total = size * size;
  if (mode === "dual") {
    const h1 = Math.ceil(total / 2);
    const h2 = Math.floor(total / 2);
    return shuffleArray([
      ...Array.from({ length: h1 }, (_, i) => ({
        value: i + 1,
        color: "cyan" as const,
      })),
      ...Array.from({ length: h2 }, (_, i) => ({
        value: i + 1,
        color: "red" as const,
      })),
    ]);
  }
  return shuffleArray(
    Array.from({ length: total }, (_, i) => ({
      value: i + 1,
      color: "cyan" as const,
    })),
  );
}

export function buildSchulteSeq(
  size: SchulteSize,
  mode: SchulteMode,
): Array<{ value: number; color: "cyan" | "red" }> {
  const total = size * size;
  if (mode === "classic")
    return Array.from({ length: total }, (_, i) => ({
      value: i + 1,
      color: "cyan" as const,
    }));
  if (mode === "reverse")
    return Array.from({ length: total }, (_, i) => ({
      value: total - i,
      color: "cyan" as const,
    }));
  const h1 = Math.ceil(total / 2),
    h2 = Math.floor(total / 2);
  const seq: Array<{ value: number; color: "cyan" | "red" }> = [];
  for (let i = 0; i < Math.max(h1, h2); i++) {
    if (i < h1) seq.push({ value: i + 1, color: "cyan" });
    if (i < h2) seq.push({ value: i + 1, color: "red" });
  }
  return seq;
}

// Cache diem tot nhat trong localStorage. Ba ham nay KHONG dung props/state,
// nen dat o pham vi module: tao lai moi lan render la vo nghia, va quan trong
// hon — de trong component thi moi useEffect goi den chung deu bi ESLint bao
// thieu dependency, ma them vao deps thi effect chay lai sau moi render.
const localStorageKey = (ns: SchulteSize, nm: SchulteMode) =>
  `nb_schulte_best_${ns}_${nm}`;

export function readLocalBest(ns: SchulteSize, nm: SchulteMode): number | null {
  try {
    const raw = localStorage.getItem(localStorageKey(ns, nm));
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

export function writeLocalBest(ns: SchulteSize, nm: SchulteMode, ms: number) {
  try {
    localStorage.setItem(localStorageKey(ns, nm), String(ms));
  } catch {
    /* private mode */
  }
}

export function formatSchulteTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const cs = Math.floor((ms % 1000) / 10);
  return m > 0
    ? `${m}:${String(s % 60).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
    : `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
