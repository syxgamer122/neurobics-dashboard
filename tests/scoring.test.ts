import { describe, expect, it } from "vitest";
import {
  sanitizeRating,
  pullUpRating,
  // decayRating,
  percentileOf,
  calcBrainAge,
  MAX_AGE_SWING,
} from "../src/app/lib/provisional-score";

describe("sanitizeRating", () => {
  it("keeps valid ratings", () => {
    expect(sanitizeRating(999)).toBe(999);
    expect(sanitizeRating(1000)).toBe(1000);
  });

  it("clamps tiny overflow, clamps legacy totals", () => {
    expect(sanitizeRating(1001)).toBe(1000);
    expect(sanitizeRating(1050)).toBe(1000);
    expect(sanitizeRating(1051)).toBe(0);
    expect(sanitizeRating(4200)).toBe(0);
  });

  it("handles invalid input", () => {
    expect(sanitizeRating(-5)).toBe(0);
    expect(sanitizeRating(null)).toBe(0);
    expect(sanitizeRating(NaN)).toBe(0);
  });
});

describe("pullUpRating (bidirectional EMA)", () => {
  it("pulls down on weaker rounds", () => {
    // 500 + 0.28*(400-500) = 472
    expect(pullUpRating(500, 400)).toBe(472);
    // 1000 + 0.28*(293-1000) = 802
    expect(pullUpRating(1000, 293)).toBe(802);
  });

  it("snaps small gaps and EMA large gains", () => {
    expect(pullUpRating(500, 502)).toBe(502);
    expect(pullUpRating(500, 600)).toBe(540);
    expect(pullUpRating(900, 902)).toBe(902);
    expect(pullUpRating(998, 1000)).toBe(1000);
    expect(pullUpRating(500, 497)).toBe(497);
  });

  it("cold-starts from empty/legacy baseline", () => {
    expect(pullUpRating(null, 300)).toBe(300);
    expect(pullUpRating(4200, 600)).toBe(600);
  });
});

describe("percentileOf", () => {
  const pop = { mean: 400, sd: 150, n: 120 };

  it("maps mean and Â±1sd", () => {
    expect(percentileOf(400, pop)).toBeCloseTo(0.5, 2);
    expect(percentileOf(550, pop)).toBeCloseTo(0.841, 2);
    expect(percentileOf(250, pop)).toBeCloseTo(0.159, 2);
  });

  it("survives zero sd", () => {
    expect(
      Number.isFinite(percentileOf(500, { mean: 400, sd: 0, n: 50 })),
    ).toBe(true);
  });
});

describe("calcBrainAge", () => {
  const NOW = new Date("2026-08-02T00:00:00.000Z");
  const pop = { mean: 400, sd: 150, n: 120 };

  it("requires age and calibration rounds", () => {
    expect(
      calcBrainAge(
        { cognitiveIndex: 500, birthYear: null, roundsPlayed: 30 },
        pop,
        NOW,
      ).status,
    ).toBe("needs_age");
    expect(
      calcBrainAge(
        { cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 3 },
        pop,
        NOW,
      ).status,
    ).toBe("calibrating");
  });

  it("anchors to real age and clamps swing", () => {
    const mean = calcBrainAge(
      { cognitiveIndex: 400, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ) as Extract<ReturnType<typeof calcBrainAge>, { status: "ready" }>;
    expect(mean.status).toBe("ready");
    expect(mean.delta).toBe(1);
    expect(mean.realAge).toBe(36);

    const strong = calcBrainAge(
      { cognitiveIndex: 900, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ) as Extract<ReturnType<typeof calcBrainAge>, { status: "ready" }>;
    expect(strong.delta).toBeGreaterThan(5);
    expect(strong.delta).toBeLessThanOrEqual(MAX_AGE_SWING);

    const weak = calcBrainAge(
      { cognitiveIndex: 50, birthYear: 1990, roundsPlayed: 30 },
      pop,
      NOW,
    ) as Extract<ReturnType<typeof calcBrainAge>, { status: "ready" }>;
    expect(weak.delta).toBeLessThan(-5);
    expect(weak.delta).toBeGreaterThanOrEqual(-MAX_AGE_SWING);

    const young = calcBrainAge(
      { cognitiveIndex: 900, birthYear: 2020, roundsPlayed: 30 },
      pop,
      NOW,
    ) as Extract<ReturnType<typeof calcBrainAge>, { status: "ready" }>;
    expect(young.age).toBeGreaterThanOrEqual(5);
  });

  it("marks thin population as provisional", () => {
    const thin = calcBrainAge(
      { cognitiveIndex: 500, birthYear: 1990, roundsPlayed: 30 },
      { mean: 400, sd: 150, n: 3 },
      NOW,
    ) as Extract<ReturnType<typeof calcBrainAge>, { status: "ready" }>;
    expect(thin.provisional).toBe(true);
  });
});

it("math logic axis is time-independent", async () => {
  const { scoreMath } =
    await import("../supabase/functions/_shared/scoring/standard-games.ts");
  const fast = scoreMath({
    timeMs: 16_000,
    difficulty: "medium",
    correct: 20,
    wrong: 0,
    totalProblems: 20,
    rts: Array(20).fill(800),
  });
  const slow = scoreMath({
    timeMs: 60_000,
    difficulty: "medium",
    correct: 20,
    wrong: 0,
    totalProblems: 20,
    rts: Array(20).fill(3000),
  });
  expect(fast.axes.logic).toBe(slow.axes.logic);
  expect(fast.axes.speed! > slow.axes.speed!).toBe(true);
});

describe("Milestone 1 — 12 Game Scoring Engines & Headline Scoring", () => {
  it("headline averages only active (non-null) axes without prior penalty", async () => {
    const { headline } =
      await import("../supabase/functions/_shared/scoring/core.ts");
    const twoAxis = {
      speed: 1000,
      focus: 1000,
      spatial: null,
      logic: null,
      memory: null,
    };
    expect(headline(twoAxis)).toBe(1000);

    const threeAxis = {
      speed: 800,
      focus: 900,
      spatial: 700,
      logic: null,
      memory: null,
    };
    expect(headline(threeAxis)).toBe(800);
  });

  it("scoreSchulte: computes valid ratings across sizes and handles failed flag", async () => {
    const { scoreSchulte } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const round = scoreSchulte({
      timeMs: 25_000,
      cells: 25,
      wrongClicks: 1,
      hitRts: [
        800, 750, 900, 850, 950, 800, 700, 900, 850, 920, 880, 840, 910, 870,
        930, 860, 890, 940, 820, 870, 910, 850, 890, 920, 860,
      ],
      modeLabel: "5x5",
    });
    expect(round.axes.speed).toBeGreaterThan(0);
    expect(round.axes.focus).toBeGreaterThan(0);
    expect(round.axes.spatial).toBeGreaterThan(0);
    expect(round.axes.logic).toBeNull();
    expect(round.axes.memory).toBeNull();
    expect(round.headline).toBeGreaterThan(0);

    const failedRound = scoreSchulte({
      timeMs: 12_000,
      cells: 25,
      wrongClicks: 3,
      hitRts: [900, 950, 850],
      failed: true,
      intendedCells: 25,
      modeLabel: "5x5",
    });
    expect(failedRound.axes.speed).toBeGreaterThan(0);
  });

  it("scoreSudoku: 0 placements yields memory = 0 and logic penalty", async () => {
    const { scoreSudoku } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const zeroPlacements = scoreSudoku({
      timeMs: 20_000,
      difficulty: "Easy",
      mistakes: 3,
      placements: 0,
      moveRts: [],
      reEntries: 0,
      repeatMistakes: 0,
      failed: true,
    });
    expect(zeroPlacements.axes.memory).toBe(0);
    expect(zeroPlacements.axes.speed).toBeNull();

    const normal = scoreSudoku({
      timeMs: 180_000,
      difficulty: "Medium",
      mistakes: 1,
      placements: 40,
      moveRts: Array(40).fill(3000),
      reEntries: 0,
      repeatMistakes: 0,
    });
    expect(normal.axes.logic).toBeGreaterThan(0);
    expect(normal.axes.memory).toBeGreaterThan(0);
    expect(normal.axes.speed).toBeGreaterThan(0);
  });

  it("scoreStroop: computes speed and focus for 30 trials", async () => {
    const { scoreStroop } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const round = scoreStroop({
      timeMs: 35_000,
      totalStimuli: 30,
      wrongClicks: 2,
      rts: Array(28).fill(1100),
    });
    expect(round.axes.speed).toBeGreaterThan(0);
    expect(round.axes.focus).toBeGreaterThan(0);
  });

  it("scoreReaction: computes speed and focus with real elapsed timeMs", async () => {
    const { scoreReaction } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const round = scoreReaction({
      timeMs: 22_000,
      rts: [220, 240, 210, 250, 230, 225, 235, 245, 215, 230],
      falseStarts: 1,
    });
    expect(round.axes.speed).toBeGreaterThan(0);
    expect(round.axes.focus).toBeGreaterThan(0);
    expect(round.timeMs).toBe(22_000);
  });

  it("scoreMemory: clearedLevels: 0 gives memory: 0 and spatial: 0", async () => {
    const { scoreMemory } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const zeroCleared = scoreMemory({
      timeMs: 2_000,
      clearedLevels: 0,
      wrongClicks: 3,
      failed: true,
    });
    expect(zeroCleared.axes.memory).toBe(0);
    expect(zeroCleared.axes.spatial).toBe(0);

    const normal = scoreMemory({
      timeMs: 45_000,
      clearedLevels: 7,
      wrongClicks: 1,
    });
    expect(normal.axes.memory).toBeGreaterThan(0);
    expect(normal.axes.spatial).toBeGreaterThan(0);
  });

  it("scoreMath: supports totalProblems or total", async () => {
    const { scoreMath } =
      await import("../supabase/functions/_shared/scoring/standard-games.ts");
    const withTotalProblems = scoreMath({
      timeMs: 30_000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 18,
      wrong: 2,
      rts: Array(20).fill(1200),
    });
    expect(withTotalProblems.axes.logic).toBeGreaterThan(0);
    expect(withTotalProblems.axes.speed).toBeGreaterThan(0);

    const withTotal = scoreMath({
      timeMs: 30_000,
      difficulty: "hard",
      total: 20,
      correct: 18,
      wrong: 2,
      rts: Array(20).fill(1200),
    });
    expect(withTotal.axes.logic).toBe(withTotalProblems.axes.logic);
  });

  it("scoreNBack: 0 hits does not throw, valid ratings computed", async () => {
    const { scoreNBack } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const zeroHits = scoreNBack({
      timeMs: 60_000,
      n: 2,
      trials: 24,
      hits: 0,
      misses: 7,
      falseAlarms: 0,
      rts: [],
    });
    expect(zeroHits.axes.memory).toBe(0);
    expect(zeroHits.axes.speed).toBeNull();
    expect(zeroHits.headline).toBe(0);

    const normal = scoreNBack({
      timeMs: 60_000,
      n: 3,
      trials: 24,
      hits: 6,
      misses: 1,
      falseAlarms: 1,
      rts: [400, 450, 420, 390, 410, 430],
    });
    expect(normal.axes.memory).toBeGreaterThan(0);
    expect(normal.axes.focus).toBeGreaterThan(0);
    expect(normal.axes.speed).toBeGreaterThan(0);
  });

  it("scoreGoNoGo: calculates focus and speed", async () => {
    const { scoreGoNoGo } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const round = scoreGoNoGo({
      timeMs: 40_000,
      trials: 30,
      goTrials: 22,
      nogoTrials: 8,
      hits: 21,
      misses: 1,
      falseAlarms: 1,
      correctRejections: 7,
      rts: Array(21).fill(320),
    });
    expect(round.axes.focus).toBeGreaterThan(0);
    expect(round.axes.speed).toBeGreaterThan(0);
  });

  it("scoreMentalRotation: calculates spatial and speed", async () => {
    const { scoreMentalRotation } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const round = scoreMentalRotation({
      timeMs: 45_000,
      trials: 24,
      correct: 20,
      wrong: 4,
      angles: Array(24).fill(90),
      mirrors: Array(24).fill(false),
      correctFlags: [...Array(20).fill(true), ...Array(4).fill(false)],
      rts: Array(24).fill(1800),
    });
    expect(round.axes.spatial).toBeGreaterThan(0);
    expect(round.axes.speed).toBeGreaterThan(0);
  });

  it("scoreCorsi: calculates memory and spatial", async () => {
    const { scoreCorsi } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const round = scoreCorsi({
      timeMs: 15_000,
      span: 6,
      trials: 7,
      correctTrials: 5,
      taps: 25,
      wrongClicks: 2,
      rts: Array(25).fill(400),
    });
    expect(round.axes.memory).toBeGreaterThan(0);
    expect(round.axes.spatial).toBeGreaterThan(0);
  });

  it("scoreTrail: calculates speed and focus for mode A and B", async () => {
    const { scoreTrail } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const roundA = scoreTrail({
      timeMs: 25_000,
      nodes: 24,
      mode: "A",
      wrongClicks: 1,
      rts: Array(23).fill(800),
    });
    expect(roundA.axes.speed).toBeGreaterThan(0);
    expect(roundA.axes.focus).toBeGreaterThan(0);

    const roundB = scoreTrail({
      timeMs: 35_000,
      nodes: 24,
      mode: "B",
      wrongClicks: 2,
      rts: Array(23).fill(1200),
    });
    expect(roundB.axes.speed).toBeGreaterThan(0);
    expect(roundB.axes.focus).toBeGreaterThan(0);
  });

  it("scoreSearch: accepts both timeMs and totalTimeMs", async () => {
    const { scoreSearch } =
      await import("../supabase/functions/_shared/scoring/advanced-games.ts");
    const withTimeMs = scoreSearch({
      timeMs: 60_000,
      score: 25,
      mistakes: 2,
      rts: Array(25).fill(1200),
    });
    expect(withTimeMs.axes.speed).toBeGreaterThan(0);
    expect(withTimeMs.axes.focus).toBeGreaterThan(0);
    expect(withTimeMs.headline).toBeGreaterThan(0);

    const withTotalTimeMs = scoreSearch({
      totalTimeMs: 60_000,
      score: 25,
      mistakes: 2,
      rts: Array(25).fill(1200),
    });
    expect(withTotalTimeMs.headline).toBe(withTimeMs.headline);
  });
});
