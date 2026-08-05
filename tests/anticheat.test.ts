// Anti-cheat: nguyen tac "tha lot con hon bat oan".
//
// Hai huong hoi quy can chan:
//   1. Bat oan  — nguoi choi that bi gan co (nguy hiem nhat).
//   2. Tha lot  — hanh vi bat kha thi khong bi gan co.
// Co CUNG (hard) tu choi van dau; co MEM (soft) van nhan nhung tru diem tin cay.
import { describe, expect, it } from "vitest";
import type { Game } from "../supabase/functions/_shared/scoring/core";
import {
  hasHardFlag,
  inspectRound,
  softFlags,
} from "../supabase/functions/_shared/anticheat";

const ALL_GAMES: Game[] = [
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
];

const messages = (game: Game, telemetry: unknown, serverElapsedMs: number) =>
  inspectRound(game, telemetry, serverElapsedMs).flags.map((f) => f.msg);

describe("khong bat oan", () => {
  it("moi game deu co inspector va telemetry rong khong sinh co nao", () => {
    for (const game of ALL_GAMES) {
      const report = inspectRound(game, {}, 60_000);
      expect(report.flags).toEqual([]);
      expect(hasHardFlag(report)).toBe(false);
    }
  });

  // Nguoi that co do dao dong phan ung tu nhien. Day la mau "nguoi that":
  // trung vi khoang 310ms, bien thien rong.
  it("nhip phan ung nguoi that khong bi gan co nao", () => {
    const report = inspectRound(
      "reaction",
      {
        rts: [268, 341, 295, 402, 312, 355, 289, 430, 301, 327],
        timeMs: 3320,
      },
      60_000,
    );
    expect(report.flags).toEqual([]);
    expect(hasHardFlag(report)).toBe(false);
    expect(softFlags(report)).toEqual([]);
  });
});

describe("co MEM: dang nghi nhung van nhan van dau", () => {
  it("nhip qua deu nhu may danh nhip", () => {
    const report = inspectRound(
      "reaction",
      { rts: Array.from({ length: 20 }, () => 300), timeMs: 6000 },
      60_000,
    );
    expect(hasHardFlag(report)).toBe(false);
    expect(softFlags(report).map((f) => f.msg)).toEqual([
      "Reaction timing too metronomic",
    ]);
  });

  it("ban Sudoku kho nhat xong qua nhanh", () => {
    const report = inspectRound(
      "sudoku",
      { difficulty: "Master", timeMs: 30_000 },
      60_000,
    );
    expect(hasHardFlag(report)).toBe(false);
    expect(softFlags(report).map((f) => f.msg)).toEqual([
      "Sudoku expert board finished too fast",
    ]);
  });

  it("thoi gian client vuot xa thoi gian server do duoc", () => {
    const report = inspectRound(
      "reaction",
      { timeMs: 300_000, rts: [300, 320] },
      5000,
    );
    expect(hasHardFlag(report)).toBe(false);
    expect(softFlags(report).map((f) => f.msg)).toEqual([
      "Client time far exceeds server elapsed",
    ]);
  });
});

describe("co CUNG: tu choi van dau", () => {
  it("trung vi phan ung duoi nguong sinh hoc", () => {
    const report = inspectRound(
      "reaction",
      { rts: Array.from({ length: 10 }, () => 90), timeMs: 900 },
      60_000,
    );
    expect(hasHardFlag(report)).toBe(true);
    expect(report.flags.map((f) => f.msg)).toEqual([
      "Majority of reaction times below 120ms",
      "Reaction median impossibly low",
      "Reaction timing too metronomic",
    ]);
    // Co cung nam trong danh sach, con softFlags chi loc ra co mem.
    expect(softFlags(report)).toHaveLength(2);
  });

  it("toc do vuot man Memory nhanh bat kha thi", () => {
    const report = inspectRound("memory", { timeMs: 1000, clearedLevels: 5 }, 60_000);
    expect(hasHardFlag(report)).toBe(true);
    expect(report.flags.map((f) => f.msg)).toEqual([
      "Memory pace impossibly fast",
    ]);
    expect(softFlags(report)).toEqual([]);
  });
});

describe("hop dong cua bao cao", () => {
  it("moi co deu co thong diep va muc do hop le", () => {
    const reports = [
      inspectRound("reaction", { rts: Array.from({ length: 10 }, () => 90) }, 60_000),
      inspectRound("memory", { timeMs: 1000, clearedLevels: 5 }, 60_000),
      inspectRound("sudoku", { difficulty: "Master", timeMs: 30_000 }, 60_000),
    ];
    for (const report of reports) {
      expect(report.flags.length).toBeGreaterThan(0);
      for (const flag of report.flags) {
        expect(typeof flag.msg).toBe("string");
        expect(flag.msg.length).toBeGreaterThan(0);
        expect(["soft", "hard"]).toContain(flag.severity);
      }
    }
  });

  it("telemetry rac khong lam sap inspector", () => {
    for (const game of ALL_GAMES) {
      expect(() => messages(game, null, 60_000)).not.toThrow();
      expect(() => messages(game, undefined, 60_000)).not.toThrow();
      expect(() => messages(game, { rts: "khong-phai-mang" }, 60_000)).not.toThrow();
      expect(() => messages(game, { rts: [null, "x", -5] }, 0)).not.toThrow();
    }
  });
});
