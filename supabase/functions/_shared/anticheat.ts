// Giai doan 6 - Chong gian lan.
// Soi telemetry sau khi cham diem. Chay tren server, client khong biet nguong.
//
// Nguyen tac:
//  - "hard" = vuot qua gioi han sinh hoc cua con nguoi -> tu choi van do luon.
//  - "soft" = dang ngo nhung van co the that -> van cho luu, chi ghi nhat ky
//    va tru diem tin cay. Tich du nhieu lan moi bi danh dau.
// Tha lot con hon bat oan: moi nguong deu noi rong hon ky luc the gioi.

import type { Game, ScoredRound } from "./round-scoring.ts";

export type CheatSeverity = "soft" | "hard";

export type CheatFlag = {
  reason: string;
  severity: CheatSeverity;
  details: Record<string, unknown>;
};

// ─── Thong ke phu tro ────────────────────────────────────────────────────────

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n) => typeof n === "number" && isFinite(n)) : [];

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** He so bien thien: do "deu" cua nhip bam. Bot bam deu nhu may. */
const cv = (xs: number[]): number => {
  if (xs.length < 4) return 1;
  const m = mean(xs);
  if (m <= 0) return 1;
  const varc = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(varc) / m;
};

// ─── Nguong ──────────────────────────────────────────────────────────────────
// Phan xa don gian nhanh nhat tung ghi nhan o van dong vien la khoang 100ms.
// Duoi 80ms thi khong con la phan xa ma la doan truoc hoac script.
const HUMAN_FLOOR_MS = 80;
// Nhip bam deu den muc nay thi gan nhu chac chan la may sinh ra.
const ROBOT_CV = 0.04;

const flag = (
  reason: string,
  severity: CheatSeverity,
  details: Record<string, unknown>,
): CheatFlag => ({ reason, severity, details });

// ─── Soi tung game ───────────────────────────────────────────────────────────

function inspectReaction(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.rts);
  if (rts.length === 0) return out;

  const fastest = Math.min(...rts);
  if (fastest < HUMAN_FLOOR_MS) {
    out.push(
      flag("Thoi gian phan xa nhanh hon gioi han con nguoi", "hard", {
        fastestMs: fastest,
      }),
    );
  }
  const med = median(rts);
  if (med < 130) {
    out.push(
      flag("Phan xa trung binh nhanh bat thuong", "hard", { medianMs: med }),
    );
  }
  const spread = cv(rts);
  if (spread < ROBOT_CV) {
    out.push(flag("Nhip bam deu nhu may", "soft", { cv: spread, medianMs: med }));
  }
  return out;
}

function inspectSchulte(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.hitRts);
  if (rts.length === 0) return out;

  // Phai vua do bang tim so vua di chuyen chuot, nen khong the duoi 150ms/o.
  const med = median(rts);
  if (med > 0 && med < 150) {
    out.push(
      flag("Toc do bam o nhanh bat thuong", "hard", {
        medianMs: med,
        cells: t?.cells,
      }),
    );
  }
  const spread = cv(rts);
  if (spread < ROBOT_CV) {
    out.push(flag("Nhip bam deu nhu may", "soft", { cv: spread }));
  }
  return out;
}

function inspectStroop(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.rts);
  if (rts.length === 0) return out;

  // Stroop bat buoc phai doc chu roi chon mau, khong the duoi 200ms.
  const med = median(rts);
  if (med > 0 && med < 200) {
    out.push(
      flag("Tra loi Stroop nhanh hon toc do doc", "hard", { medianMs: med }),
    );
  }
  const spread = cv(rts);
  if (spread < ROBOT_CV) {
    out.push(flag("Nhip tra loi deu nhu may", "soft", { cv: spread }));
  }
  return out;
}

function inspectSudoku(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.moveRts);
  const difficulty = String(t?.difficulty ?? "");
  const timeMs = Number(t?.timeMs);

  if (rts.length > 0) {
    const med = median(rts);
    // Moi nuoc deu phai suy luan; duoi 120ms deu tay la dau hieu dien giai san.
    if (med > 0 && med < 120) {
      out.push(
        flag("Toc do dien so nhanh bat thuong", "hard", {
          medianMs: med,
          difficulty,
        }),
      );
    }
    const spread = cv(rts);
    if (spread < ROBOT_CV) {
      out.push(flag("Nhip dien so deu nhu may", "soft", { cv: spread }));
    }
  }

  // Ky luc the gioi Sudoku kho vao khoang mot phut. Duoi 45 giay o muc kho
  // nhat thi rat dang ngo, nhung van chi ghi nhan mem.
  if (
    isFinite(timeMs) &&
    timeMs < 45_000 &&
    (difficulty === "Master" || difficulty === "Extreme")
  ) {
    out.push(
      flag("Giai Sudoku muc kho qua nhanh", "soft", { timeMs, difficulty }),
    );
  }
  return out;
}

function inspectMemory(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const level = Number(t?.maxLevel);
  const timeMs = Number(t?.timeMs);

  // Moi cap do deu co thoi gian ghi nho co dinh, khong the rut ngan.
  if (isFinite(level) && isFinite(timeMs) && level >= 5) {
    const perLevel = timeMs / level;
    if (perLevel < 1_200) {
      out.push(
        flag("Vuot cap do ghi nho nhanh bat thuong", "hard", {
          maxLevel: level,
          msPerLevel: Math.round(perLevel),
        }),
      );
    }
  }
  if (isFinite(level) && level >= 15) {
    out.push(flag("Dat cap do ghi nho rat cao", "soft", { maxLevel: level }));
  }
  return out;
}

function inspectNBack(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.rts);
  const n = Number(t?.n);
  const hits = Number(t?.hits);
  const misses = Number(t?.misses);
  const falseAlarms = Number(t?.falseAlarms);

  if (rts.length > 0) {
    const med = median(rts);
    if (med > 0 && med < 150) {
      out.push(
        flag("Phan hoi N-Back nhanh bat thuong", "hard", { medianMs: med, n }),
      );
    }
    const spread = cv(rts);
    if (spread < ROBOT_CV) {
      out.push(flag("Nhip phan hoi deu nhu may", "soft", { cv: spread }));
    }
  }

  // Hoan hao tuyet doi o muc n cao la cuc hiem.
  if (
    isFinite(n) &&
    n >= 4 &&
    misses === 0 &&
    falseAlarms === 0 &&
    hits >= 5
  ) {
    out.push(
      flag("Chinh xac tuyet doi o muc N-Back cao", "soft", {
        n,
        hits,
      }),
    );
  }
  return out;
}

// ─── Diem tra chung cho moi game ─────────────────────────────────────────────

function inspectShared(
  scored: ScoredRound,
  serverElapsedMs: number,
): CheatFlag[] {
  const out: CheatFlag[] = [];

  // Client bao choi lau hon nhieu so voi thoi gian ve thuc te. scoreAndValidate
  // da chan moc 15 giay; o day bat truong hop lech vua du de qua cua nhung van
  // bat thuong, vi keo dai thoi gian giup an diem "on dinh".
  const drift = scored.timeMs - serverElapsedMs;
  if (drift > 5_000) {
    out.push(
      flag("Thoi gian client bao lech so voi server", "soft", {
        driftMs: Math.round(drift),
      }),
    );
  }

  // Diem kich tran o nhieu truc cung luc.
  const maxed = Object.values(scored.axes).filter(
    (v) => typeof v === "number" && v >= 1000,
  ).length;
  if (maxed >= 2) {
    out.push(flag("Nhieu truc dat diem toi da cung luc", "soft", { maxed }));
  }

  return out;
}

function inspectMath(t: any): CheatFlag[] {
  const out: CheatFlag[] = [];
  const rts = nums(t?.rts);
  if (rts.length === 0) return out;

  // Phai doc de, tinh, roi bam. Duoi 250ms la nhanh hon ca toc do doc.
  const med = median(rts);
  if (med > 0 && med < 250) {
    out.push(
      flag("Tra loi toan nhanh hon toc do doc de", "hard", { medianMs: med }),
    );
  }

  const spread = cv(rts);
  if (spread < ROBOT_CV) {
    out.push(flag("Nhip tra loi deu nhu may", "soft", { cv: spread }));
  }

  // Dung tuyet doi o muc kho ma van rat nhanh: dang ngo nhung khong chac chan,
  // nen chi ghi nhan nhe chu khong tu choi van.
  const correct = Number(t?.correct ?? 0);
  const total = Number(t?.totalProblems ?? 0);
  if (t?.difficulty === "hard" && total > 0 && correct === total && med < 1_200) {
    out.push(
      flag("Dung tuyet doi o muc kho voi nhip bat thuong", "soft", {
        medianMs: med,
      }),
    );
  }
  return out;
}

/**
 * Tra ve danh sach nghi van. Rong nghia la van dau sach.
 * Ham nay khong bao gio nem loi: soi gian lan hong khong duoc lam hong van choi.
 */
export function inspectRound(
  game: Game,
  telemetry: unknown,
  scored: ScoredRound,
  serverElapsedMs: number,
): CheatFlag[] {
  try {
    const t = telemetry as any;
    const perGame =
      game === "math"
        ? inspectMath(t)
        : game === "reaction"
        ? inspectReaction(t)
        : game === "schulte"
          ? inspectSchulte(t)
          : game === "stroop"
            ? inspectStroop(t)
            : game === "sudoku"
              ? inspectSudoku(t)
              : game === "nback"
                ? inspectNBack(t)
                : inspectMemory(t);
    return [...perGame, ...inspectShared(scored, serverElapsedMs)];
  } catch (_err) {
    return [];
  }
}

export const hasHardFlag = (flags: CheatFlag[]): boolean =>
  flags.some((f) => f.severity === "hard");
