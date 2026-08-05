import { describe, expect, it } from "vitest";
import {
  inspectRound,
  hasHardFlag,
  softFlags,
  type CheatReport,
} from "../supabase/functions/_shared/anticheat";

// Nguyen tac cua module nay ghi ngay dong dau file: "tha lot con hon bat oan".
// Nen test chia lam hai nua can nhau:
//   - Nua thu nhat: van gian lan trang tron PHAI bi bat.
//   - Nua thu hai: van nguoi that choi PHAI di qua sach.
// Nua thu hai quan trong hon. Mot co bao sai la mot nguoi choi that bi mat diem.

const msgs = (r: CheatReport) => r.flags.map((f) => f.msg);
const deu = (n: number, ms: number) => new Array(n).fill(ms);

// Nhip bam cua nguoi that: nhanh cham that thuong, khong bao gio deu tap.
const NHIP_NGUOI = [420, 511, 388, 604, 455, 372, 690, 501, 433, 588];

describe("van nguoi that choi — khong duoc bao dong nham", () => {
  it("schulte binh thuong: sach", () => {
    const r = inspectRound(
      "schulte",
      {
        timeMs: 30_000,
        cells: 25,
        wrongClicks: 2,
        hitRts: NHIP_NGUOI,
        modeLabel: "5x5",
      },
      30_000,
    );
    expect(msgs(r)).toEqual([]);
  });

  it("reaction nhanh nhung khong deu: sach", () => {
    const r = inspectRound(
      "reaction",
      { timeMs: 5_000, rts: [220, 265, 198, 301, 245], falseStarts: 0 },
      5_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual([]);
  });

  it("memory choi lau, co sai vai lan: sach", () => {
    const r = inspectRound(
      "memory",
      { timeMs: 120_000, maxLevel: 5, clearedLevels: 5, wrongClicks: 3 },
      120_000,
    );
    expect(msgs(r)).toEqual([]);
  });

  it("sudoku de, lam that: sach", () => {
    const r = inspectRound(
      "sudoku",
      {
        timeMs: 400_000,
        difficulty: "Easy",
        mistakes: 1,
        placements: 45,
        moveRts: NHIP_NGUOI,
        reEntries: 1,
        repeatMistakes: 0,
      },
      400_000,
    );
    expect(msgs(r)).toEqual([]);
  });

  it("stroop binh thuong: sach", () => {
    const r = inspectRound(
      "stroop",
      { timeMs: 45_000, totalStimuli: 40, wrongClicks: 3, rts: NHIP_NGUOI },
      45_000,
    );
    expect(msgs(r)).toEqual([]);
  });
});

describe("co cung — tu choi ca van", () => {
  it("phan xa 90ms deu tap thi bi chan", () => {
    const r = inspectRound(
      "reaction",
      { timeMs: 5_000, rts: deu(10, 90), falseStarts: 0 },
      5_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(msgs(r)).toEqual([
      "Majority of reaction times below 120ms",
      "Reaction median impossibly low",
      "Reaction timing too metronomic",
    ]);
  });

  it("memory qua 9 cap trong 1 giay thi bi chan", () => {
    const r = inspectRound(
      "memory",
      { timeMs: 1_000, maxLevel: 9, clearedLevels: 9, wrongClicks: 0 },
      1_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(msgs(r)).toEqual(["Memory pace impossibly fast"]);
  });

  it("math tra loi dung het trong 120ms moi cau thi bi chan", () => {
    const r = inspectRound(
      "math",
      {
        timeMs: 60_000,
        difficulty: "hard",
        totalProblems: 40,
        correct: 40,
        wrong: 0,
        rts: deu(40, 120),
      },
      60_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(msgs(r)).toContain("Math median impossibly low");
  });

  it("corsi span 9 bam 100ms mot o thi bi chan", () => {
    const r = inspectRound(
      "corsi",
      {
        timeMs: 3_000,
        span: 9,
        trials: 9,
        correctTrials: 9,
        taps: 45,
        wrongClicks: 0,
        rts: deu(45, 100),
      },
      3_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(msgs(r)).toContain("Corsi tap median impossibly low");
  });

  it("mental rotation dung het o toc do may thi bi chan", () => {
    const r = inspectRound(
      "mental",
      {
        timeMs: 10_000,
        trials: 20,
        correct: 20,
        wrong: 0,
        angles: new Array(20).fill(120),
        mirrors: new Array(20).fill(true),
        correctFlags: new Array(20).fill(true),
        rts: deu(20, 200),
      },
      10_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(msgs(r)).toContain("Mental Rotation median impossibly low");
  });
});

describe("co mem — van tinh diem nhung ghi so", () => {
  it("bam deu nhu may nhung toc do nguoi: chi canh bao", () => {
    const r = inspectRound(
      "reaction",
      { timeMs: 5_000, rts: [250, 251, 249, 250, 250], falseStarts: 0 },
      5_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual(["Reaction timing too metronomic"]);
  });

  it("sudoku Master xong trong 30 giay: chi canh bao", () => {
    // Nhanh den kho tin, nhung khong phai bat kha thi. Van duoc tinh diem.
    const r = inspectRound(
      "sudoku",
      {
        timeMs: 30_000,
        difficulty: "Master",
        mistakes: 0,
        placements: 51,
        moveRts: deu(51, 500),
        reEntries: 0,
        repeatMistakes: 0,
      },
      30_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual([
      "Sudoku timing too metronomic",
      "Sudoku expert board finished too fast",
    ]);
  });

  it("gonogo uc che hoan hao: chi canh bao", () => {
    const r = inspectRound(
      "gonogo",
      {
        timeMs: 60_000,
        trials: 60,
        goTrials: 45,
        nogoTrials: 15,
        hits: 45,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 15,
        rts: deu(45, 200),
      },
      60_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toContain("Perfect inhibition with very fast Go RTs");
  });

  it("nback deu tap: chi canh bao", () => {
    const r = inspectRound(
      "nback",
      {
        timeMs: 60_000,
        n: 3,
        trials: 40,
        hits: 12,
        misses: 0,
        falseAlarms: 0,
        rts: deu(12, 300),
      },
      60_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual(["N-Back timing too metronomic"]);
  });

  it("dong ho may khach vuot xa may chu: chi canh bao", () => {
    const r = inspectRound(
      "schulte",
      {
        timeMs: 500_000,
        cells: 25,
        wrongClicks: 0,
        hitRts: NHIP_NGUOI,
        modeLabel: "5x5",
      },
      5_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual(["Client time far exceeds server elapsed"]);
  });

  it("trail deu tap: chi canh bao", () => {
    const r = inspectRound(
      "trail",
      {
        timeMs: 30_000,
        nodes: 24,
        mode: "B",
        wrongClicks: 0,
        rts: deu(23, 400),
      },
      30_000,
    );
    expect(hasHardFlag(r)).toBe(false);
    expect(msgs(r)).toEqual(["Trail Making timing too metronomic"]);
  });
});

describe("du lieu thieu hoac hong", () => {
  it("telemetry rong khong lam sap va khong bao dong", () => {
    for (const t of [null, undefined, {}, []]) {
      const r = inspectRound("schulte", t, 1_000);
      expect(msgs(r)).toEqual([]);
    }
  });

  it("khong nem loi voi bat ky tro nao khi thieu du lieu", () => {
    const games = [
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
    ] as const;
    for (const g of games) {
      expect(() => inspectRound(g, {}, 1_000), g).not.toThrow();
      expect(() => inspectRound(g, null, 0), g).not.toThrow();
    }
  });
});

describe("hasHardFlag / softFlags", () => {
  it("chia dung hai loai co", () => {
    const r = inspectRound(
      "reaction",
      { timeMs: 5_000, rts: deu(10, 90), falseStarts: 0 },
      5_000,
    );
    expect(hasHardFlag(r)).toBe(true);
    expect(softFlags(r)).toHaveLength(2);
    expect(softFlags(r).every((f) => f.severity === "soft")).toBe(true);
    // Tong hai loai bang tong so co.
    expect(
      softFlags(r).length + r.flags.filter((f) => f.severity === "hard").length,
    ).toBe(r.flags.length);
  });

  it("bao cao rong thi khong co co cung nao", () => {
    expect(hasHardFlag({ flags: [] })).toBe(false);
    expect(softFlags({ flags: [] })).toEqual([]);
  });
});
