/**
 * Regression tests cho hai bien da tung lam rating khong hop le:
 *
 * 1. NaN / Infinity di xuyen qua clamp va lam hong rating.
 * 2. Nhanh snap va EMA khong noi lien nhau, nen diem vong cao hon co the tao
 *    rating thap hon ngay sat bien RATING_SNAP.
 *
 * Day la test cho HOP DONG MONG MUON sau khi va, khong con khoa bug cu lai.
 */

import { describe, expect, it } from "vitest";
import {
  clampRating,
  clamp01,
  sanitizeRating,
  applyRoundRating,
  RATING_MIN,
  RATING_MAX,
  RATING_SNAP,
  EMA_ALPHA,
  EMA_ALPHA_DOWN,
} from "../src/app/lib/provisional-score";

describe("non-finite input — khong duoc lam hong rating", () => {
  it("clampRating dua moi gia tri khong huu han ve moc an toan", () => {
    expect(clampRating(NaN)).toBe(RATING_MIN);
    expect(clampRating(Infinity)).toBe(RATING_MIN);
    expect(clampRating(-Infinity)).toBe(RATING_MIN);
  });

  it("clamp01 dua moi gia tri khong huu han ve 0", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });

  it("diem vong hong giu nguyen rating cu thay vi phat nguoi choi", () => {
    expect(applyRoundRating(500, NaN)).toBe(500);
    expect(applyRoundRating(500, Infinity)).toBe(500);
    expect(applyRoundRating(500, -Infinity)).toBe(500);
  });

  it("cold start + diem hong tra ve moc 0 hop le", () => {
    expect(applyRoundRating(null, NaN)).toBe(0);
    expect(applyRoundRating(undefined, Infinity)).toBe(0);
  });

  it("prev hong van duoc sanitize truoc khi dung", () => {
    expect(applyRoundRating(NaN as unknown as number, 500)).toBe(500);
    expect(sanitizeRating(NaN)).toBe(0);
  });
});

describe("snap + EMA — don dieu tren toan mien diem", () => {
  it("giu nguyen quy tac snap trong khoang 3 diem", () => {
    expect(RATING_SNAP).toBe(3);
    expect(applyRoundRating(500, 497)).toBe(497);
    expect(applyRoundRating(500, 498)).toBe(498);
    expect(applyRoundRating(500, 502)).toBe(502);
    expect(applyRoundRating(500, 503)).toBe(503);
  });

  it("khong con dao chieu ngay ngoai bien tang", () => {
    expect(applyRoundRating(500, 503)).toBe(503);
    expect(applyRoundRating(500, 504)).toBe(503);

    // Plateau la hop le; dieu khong hop le la output di lui khi input tang.
    for (const round of [504, 505, 506, 507, 508]) {
      expect(applyRoundRating(500, round)).toBe(503);
    }
    expect(applyRoundRating(500, 509)).toBe(504);
  });

  it("khong con dao chieu ngay ngoai bien giam", () => {
    expect(applyRoundRating(500, 496)).toBe(497);
    expect(applyRoundRating(500, 497)).toBe(497);
    expect(applyRoundRating(500, 487)).toBe(496);
  });

  it("don dieu voi moi round 0..1000 tai nhieu rating goc", () => {
    for (const prev of [0, 1, 2, 250, 500, 750, 998, 999, 1000]) {
      let last = -Infinity;
      for (let round = RATING_MIN; round <= RATING_MAX; round++) {
        const out = applyRoundRating(prev, round);
        expect(out).toBeGreaterThanOrEqual(last);
        last = out;
      }
    }
  });

  it("khong vuot qua khoang giua rating cu va diem vong", () => {
    for (const prev of [1, 250, 500, 750, 999]) {
      for (const round of [0, 1, 100, 497, 500, 503, 900, 1000]) {
        const out = applyRoundRating(prev, round);
        expect(out).toBeGreaterThanOrEqual(Math.min(prev, round));
        expect(out).toBeLessThanOrEqual(Math.max(prev, round));
      }
    }
  });

  it("cac duong EMA binh thuong khong doi", () => {
    expect(applyRoundRating(500, 600)).toBe(540);
    expect(applyRoundRating(500, 400)).toBe(472);
    expect(EMA_ALPHA).toBe(0.4);
    expect(EMA_ALPHA_DOWN).toBe(0.28);
  });

  it("dau vao huu han luon cho so nguyen trong [0, 1000]", () => {
    for (const prev of [0, 1, 250, 500, 750, 999, 1000]) {
      for (const round of [0, 1, 250, 500, 750, 999, 1000]) {
        const out = applyRoundRating(prev, round);
        expect(Number.isFinite(out)).toBe(true);
        expect(Number.isInteger(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(RATING_MIN);
        expect(out).toBeLessThanOrEqual(RATING_MAX);
      }
    }
  });
});

describe("Milestone 1 — Scoring Engines Edge Cases & Boundary Handling", () => {
  it("zero-performance rounds return non-negative integer headline without NaN or throwing", async () => {
    const {
      scoreSchulte,
      scoreSudoku,
      scoreStroop,
      scoreReaction,
      scoreMemory,
      scoreMath,
    } = await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const {
      scoreNBack,
      scoreGoNoGo,
      scoreMentalRotation,
      scoreCorsi,
      scoreTrail,
      scoreSearch,
    } = await import("../supabase/functions/_shared/scoring/advanced-games.ts");

    const schulteZero = scoreSchulte({
      timeMs: 10_000,
      cells: 25,
      wrongClicks: 3,
      hitRts: [],
      failed: true,
      modeLabel: "5x5",
    });
    expect(schulteZero.headline).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(schulteZero.headline)).toBe(true);

    const sudokuZero = scoreSudoku({
      timeMs: 10_000,
      difficulty: "Easy",
      mistakes: 3,
      placements: 0,
      moveRts: [],
      reEntries: 0,
      repeatMistakes: 0,
      failed: true,
    });
    expect(sudokuZero.headline).toBeGreaterThanOrEqual(0);

    const stroopZero = scoreStroop({
      timeMs: 10_000,
      totalStimuli: 30,
      wrongClicks: 3,
      rts: [],
    });
    expect(stroopZero.headline).toBeGreaterThanOrEqual(0);

    const reactionZero = scoreReaction({
      timeMs: 10_000,
      rts: Array(10).fill(500),
      falseStarts: 20,
    });
    expect(reactionZero.headline).toBeGreaterThanOrEqual(0);

    const memoryZero = scoreMemory({
      timeMs: 150,
      clearedLevels: 0,
      wrongClicks: 3,
      failed: true,
    });
    expect(memoryZero.headline).toBe(0);

    const mathZero = scoreMath({
      timeMs: 10_000,
      difficulty: "easy",
      totalProblems: 20,
      correct: 0,
      wrong: 20,
      rts: Array(20).fill(500),
    });
    expect(mathZero.headline).toBe(0);

    const nbackZero = scoreNBack({
      timeMs: 30_000,
      n: 2,
      trials: 24,
      hits: 0,
      misses: 7,
      falseAlarms: 10,
      rts: [],
    });
    expect(nbackZero.headline).toBe(0);

    const gonogoZero = scoreGoNoGo({
      timeMs: 20_000,
      trials: 30,
      goTrials: 20,
      nogoTrials: 10,
      hits: 0,
      misses: 20,
      falseAlarms: 10,
      correctRejections: 0,
      rts: [],
    });
    expect(gonogoZero.headline).toBe(0);

    const mentalZero = scoreMentalRotation({
      timeMs: 20_000,
      trials: 20,
      correct: 0,
      wrong: 20,
      angles: Array(20).fill(90),
      mirrors: Array(20).fill(false),
      correctFlags: Array(20).fill(false),
      rts: Array(20).fill(1200),
    });
    expect(mentalZero.headline).toBe(0);

    const corsiZero = scoreCorsi({
      timeMs: 900,
      span: 0,
      trials: 2,
      correctTrials: 0,
      taps: 0,
      wrongClicks: 2,
      rts: [],
    });
    expect(corsiZero.headline).toBe(0);

    const trailZero = scoreTrail({
      timeMs: 15_000,
      nodes: 24,
      mode: "A",
      wrongClicks: 30,
      rts: Array(23).fill(2500),
    });
    expect(trailZero.headline).toBeGreaterThanOrEqual(0);

    const searchZero = scoreSearch({
      timeMs: 35_000,
      score: 0,
      mistakes: 15,
      rts: [],
    });
    expect(searchZero.headline).toBe(0);
  });

  it("handles fast rounds near lower duration bounds without exceptions", async () => {
    const { scoreReaction, scoreMemory, scoreMath } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const { scoreCorsi, scoreNBack, scoreMentalRotation } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");

    // Reaction timeMs lower bound: 5ms
    expect(() =>
      scoreReaction({
        timeMs: 1200,
        rts: Array(10).fill(180),
        falseStarts: 0,
      }),
    ).not.toThrow();

    // Memory timeMs lower bound: 100ms
    expect(() =>
      scoreMemory({
        timeMs: 120,
        clearedLevels: 0,
        wrongClicks: 3,
        failed: true,
      }),
    ).not.toThrow();

    // Corsi timeMs lower bound: 800ms
    expect(() =>
      scoreCorsi({
        timeMs: 850,
        span: 0,
        trials: 2,
        correctTrials: 0,
        taps: 0,
        wrongClicks: 2,
        rts: [],
      }),
    ).not.toThrow();

    // Math timeMs lower bound: 3000ms
    expect(() =>
      scoreMath({
        timeMs: 3500,
        difficulty: "easy",
        totalProblems: 5,
        correct: 5,
        wrong: 0,
        rts: Array(5).fill(600),
      }),
    ).not.toThrow();

    // NBack timeMs lower bound: 3000ms
    expect(() =>
      scoreNBack({
        timeMs: 3500,
        n: 2,
        trials: 10,
        hits: 2,
        misses: 0,
        falseAlarms: 0,
        rts: [300, 320],
      }),
    ).not.toThrow();

    // Mental timeMs lower bound: 8000ms
    expect(() =>
      scoreMentalRotation({
        timeMs: 8500,
        trials: 20,
        correct: 20,
        wrong: 0,
        angles: Array(20).fill(60),
        mirrors: Array(20).fill(false),
        correctFlags: Array(20).fill(true),
        rts: Array(20).fill(400),
      }),
    ).not.toThrow();
  });
});
