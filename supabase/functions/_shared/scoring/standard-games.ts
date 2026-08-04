// Schulte, Sudoku, Stroop, Reaction, Memory and Math.
import {
  MAX, NO_AXES, clamp, clamp01, finite, focus, headline, int,
  median, numberArray, ratio, speed, statSamples,
  type ScoredRound,
} from "./core.ts";

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

export function scoreSchulte(t: any): ScoredRound {
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
export function scoreSudoku(t: any): ScoredRound {
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

export function scoreStroop(t: any): ScoredRound {
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
export function scoreReaction(t: any): ScoredRound {
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
export function scoreMemory(t: any): ScoredRound {
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
export function scoreMath(t: any): ScoredRound {
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
