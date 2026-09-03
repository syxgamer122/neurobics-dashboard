import { describe, expect, it } from "vitest";
import { parseTelemetry } from "../supabase/functions/_shared/scoring/schema";
import {
  assertCountBounds,
  assertRtBounds,
} from "../supabase/functions/_shared/scoring/validation";
import {
  scoreAndValidate,
  type Game,
} from "../supabase/functions/_shared/round-scoring";
import { headline } from "../supabase/functions/_shared/scoring/core";
import {
  scoreReaction,
  scoreMemory,
  scoreMath,
} from "../supabase/functions/_shared/scoring/standard-games";
import {
  scoreGoNoGo,
  scoreCorsi,
} from "../supabase/functions/_shared/scoring/advanced-games";
import {
  inspectRound,
  shouldReject,
  hasHardFlag,
} from "../supabase/functions/_shared/anticheat";

describe("Milestone 1 Empirical Challenge: Mathematical Invariants & Fuzzing", () => {
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
    "search",
  ];

  it("Invariant: headline computes exact active axis average without prior penalty", () => {
    // 1-axis active
    expect(
      headline({
        speed: 750,
        focus: null,
        spatial: null,
        logic: null,
        memory: null,
      }),
    ).toBe(750);

    // 2-axes active: (900 + 700)/2 = 800
    expect(
      headline({
        speed: 900,
        focus: 700,
        spatial: null,
        logic: null,
        memory: null,
      }),
    ).toBe(800);

    // 3-axes active: (800 + 600 + 400)/3 = 600
    expect(
      headline({
        speed: 800,
        focus: 600,
        spatial: 400,
        logic: null,
        memory: null,
      }),
    ).toBe(600);

    // 5-axes active: (1000 + 800 + 600 + 400 + 200)/5 = 600
    expect(
      headline({
        speed: 1000,
        focus: 800,
        spatial: 600,
        logic: 400,
        memory: 200,
      }),
    ).toBe(600);

    // All null returns 0
    expect(
      headline({
        speed: null,
        focus: null,
        spatial: null,
        logic: null,
        memory: null,
      }),
    ).toBe(0);
  });

  it("Invariant: all 12 scorers return scores strictly clamped in [0, 1000] and finite integers", () => {
    const validPayloads: Record<Game, Record<string, unknown>> = {
      schulte: {
        timeMs: 25000,
        cells: 25,
        wrongClicks: 0,
        hitRts: Array(25).fill(800),
        modeLabel: "5x5",
      },
      sudoku: {
        timeMs: 120000,
        difficulty: "Medium",
        placements: 35,
        moveRts: Array(35).fill(2000),
        mistakes: 0,
        reEntries: 0,
        repeatMistakes: 0,
      },
      stroop: {
        timeMs: 30000,
        totalStimuli: 30,
        wrongClicks: 0,
        rts: Array(30).fill(900),
      },
      reaction: {
        timeMs: 20000,
        rts: Array(10).fill(250),
        falseStarts: 0,
      },
      memory: {
        timeMs: 40000,
        clearedLevels: 8,
        wrongClicks: 0,
      },
      math: {
        timeMs: 25000,
        difficulty: "hard",
        totalProblems: 20,
        correct: 20,
        wrong: 0,
        rts: Array(20).fill(1100),
      },
      nback: {
        timeMs: 60000,
        n: 3,
        trials: 24,
        hits: 6,
        misses: 0,
        falseAlarms: 0,
        rts: Array(6).fill(400),
      },
      gonogo: {
        timeMs: 40000,
        trials: 30,
        goTrials: 20,
        nogoTrials: 10,
        hits: 20,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 10,
        rts: Array(20).fill(300),
      },
      mental: {
        timeMs: 35000,
        trials: 20,
        correct: 20,
        wrong: 0,
        angles: Array(20).fill(90),
        mirrors: Array(20).fill(false),
        correctFlags: Array(20).fill(true),
        rts: Array(20).fill(1500),
      },
      corsi: {
        timeMs: 20000,
        span: 7,
        trials: 8,
        correctTrials: 6,
        taps: 30,
        wrongClicks: 2,
        rts: Array(30).fill(400),
      },
      trail: {
        timeMs: 25000,
        nodes: 24,
        mode: "B",
        wrongClicks: 0,
        rts: Array(23).fill(900),
      },
      search: {
        timeMs: 60000,
        score: 30,
        mistakes: 1,
        rts: Array(30).fill(1200),
      },
    };

    for (const game of ALL_GAMES) {
      const payload = validPayloads[game];
      const scored = scoreAndValidate(
        game,
        payload,
        (payload.timeMs as number) + 1000,
      );
      expect(Number.isFinite(scored.headline)).toBe(true);
      expect(Number.isInteger(scored.headline)).toBe(true);
      expect(scored.headline).toBeGreaterThanOrEqual(0);
      expect(scored.headline).toBeLessThanOrEqual(1000);

      for (const [, val] of Object.entries(scored.axes)) {
        if (val !== null) {
          expect(Number.isFinite(val)).toBe(true);
          expect(Number.isInteger(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it("Invariant: Monotonicity of Reaction Scoring", () => {
    // Reaction: faster RT -> strictly higher speed
    const fast = scoreReaction({
      timeMs: 15000,
      rts: Array(10).fill(180),
      falseStarts: 0,
    });
    const medium = scoreReaction({
      timeMs: 15000,
      rts: Array(10).fill(280),
      falseStarts: 0,
    });
    const slow = scoreReaction({
      timeMs: 15000,
      rts: Array(10).fill(450),
      falseStarts: 0,
    });

    expect(fast.axes.speed!).toBeGreaterThan(medium.axes.speed!);
    expect(medium.axes.speed!).toBeGreaterThan(slow.axes.speed!);

    // More false starts -> lower focus
    const cleanFocus = scoreReaction({
      timeMs: 15000,
      rts: Array(10).fill(280),
      falseStarts: 0,
    });
    const dirtyFocus = scoreReaction({
      timeMs: 15000,
      rts: Array(10).fill(280),
      falseStarts: 5,
    });
    expect(cleanFocus.axes.focus!).toBeGreaterThan(dirtyFocus.axes.focus!);
  });

  it("Invariant: Monotonicity of Math Sprint Scoring", () => {
    // Higher accuracy -> higher logic
    const perfectLogic = scoreMath({
      timeMs: 25000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 20,
      wrong: 0,
      rts: Array(20).fill(1000),
    });
    const halfLogic = scoreMath({
      timeMs: 25000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 10,
      wrong: 10,
      rts: Array(20).fill(1000),
    });
    const zeroLogic = scoreMath({
      timeMs: 25000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 0,
      wrong: 20,
      rts: Array(20).fill(1000),
    });

    expect(perfectLogic.axes.logic!).toBeGreaterThan(halfLogic.axes.logic!);
    expect(halfLogic.axes.logic!).toBeGreaterThan(zeroLogic.axes.logic!);
    expect(zeroLogic.axes.logic!).toBe(0);

    // Faster clean RTs -> higher speed
    const fastMath = scoreMath({
      timeMs: 25000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 20,
      wrong: 0,
      rts: Array(20).fill(600),
    });
    const slowMath = scoreMath({
      timeMs: 25000,
      difficulty: "hard",
      totalProblems: 20,
      correct: 20,
      wrong: 0,
      rts: Array(20).fill(2500),
    });
    expect(fastMath.axes.speed!).toBeGreaterThan(slowMath.axes.speed!);
  });

  it("Invariant: Monotonicity of Memory Matrix Scoring", () => {
    const level10 = scoreMemory({
      timeMs: 60000,
      clearedLevels: 10,
      wrongClicks: 0,
    });
    const level5 = scoreMemory({
      timeMs: 30000,
      clearedLevels: 5,
      wrongClicks: 0,
    });
    const level1 = scoreMemory({
      timeMs: 5000,
      clearedLevels: 1,
      wrongClicks: 0,
    });
    const level0 = scoreMemory({
      timeMs: 1500,
      clearedLevels: 0,
      wrongClicks: 3,
      failed: true,
    });

    expect(level10.axes.memory!).toBeGreaterThan(level5.axes.memory!);
    expect(level5.axes.memory!).toBeGreaterThan(level1.axes.memory!);
    expect(level1.axes.memory!).toBeGreaterThan(level0.axes.memory!);
    expect(level0.axes.memory!).toBe(0);
    expect(level0.axes.spatial!).toBe(0);
  });

  it("Invariant: Monotonicity of Corsi Block Span", () => {
    const span8 = scoreCorsi({
      timeMs: 25000,
      span: 8,
      trials: 8,
      correctTrials: 7,
      taps: 35,
      wrongClicks: 1,
      rts: Array(35).fill(400),
    });
    const span5 = scoreCorsi({
      timeMs: 20000,
      span: 5,
      trials: 6,
      correctTrials: 4,
      taps: 20,
      wrongClicks: 2,
      rts: Array(20).fill(400),
    });
    const span2 = scoreCorsi({
      timeMs: 5000,
      span: 2,
      trials: 2,
      correctTrials: 1,
      taps: 4,
      wrongClicks: 1,
      rts: Array(4).fill(400),
    });

    expect(span8.axes.memory!).toBeGreaterThan(span5.axes.memory!);
    expect(span5.axes.memory!).toBeGreaterThan(span2.axes.memory!);
  });

  it("Invariant: Go/No-Go Pure Spamming vs No-Tap Abuse returns zero or low score", () => {
    // 1. Spamming all (hits = 20, FA = 10, faRate = 1.0)
    const spammed = scoreGoNoGo({
      timeMs: 30000,
      trials: 30,
      goTrials: 20,
      nogoTrials: 10,
      hits: 20,
      misses: 0,
      falseAlarms: 10,
      correctRejections: 0,
      rts: Array(20).fill(250),
    });
    expect(spammed.axes.focus!).toBe(0);
    expect(spammed.axes.speed!).toBe(0);
    expect(spammed.headline).toBe(0);

    // 2. Doing nothing (hits = 0, FA = 0, hitRate = 0)
    const afk = scoreGoNoGo({
      timeMs: 30000,
      trials: 30,
      goTrials: 20,
      nogoTrials: 10,
      hits: 0,
      misses: 20,
      falseAlarms: 0,
      correctRejections: 10,
      rts: [],
    });
    expect(afk.axes.focus!).toBe(0);
    expect(afk.axes.speed).toBeNull();
    expect(afk.headline).toBe(0);
  });
});

describe("Milestone 1 Empirical Challenge: Telemetry Validation Edge Cases & Rejection", () => {
  it("Rejects 0-duration, negative, NaN, Infinity durations in parseTelemetry", () => {
    expect(() =>
      parseTelemetry("reaction", { timeMs: 0, rts: [200] }),
    ).toThrow();
    expect(() =>
      parseTelemetry("reaction", { timeMs: -500, rts: [200] }),
    ).toThrow();
    expect(() =>
      parseTelemetry("reaction", { timeMs: NaN, rts: [200] }),
    ).toThrow();
    expect(() =>
      parseTelemetry("reaction", { timeMs: Infinity, rts: [200] }),
    ).toThrow();
    expect(() =>
      parseTelemetry("reaction", { timeMs: "1000", rts: [200] }),
    ).toThrow();
  });

  it("Rejects malformed RT arrays (negative, NaN, strings, over 5000 items)", () => {
    expect(() => assertRtBounds([-50], 10000, "test")).toThrow();
    expect(() =>
      assertRtBounds(["200" as unknown as number], 10000, "test"),
    ).toThrow();
    expect(() =>
      assertRtBounds(Array(5001).fill(100), 1000000, "test"),
    ).toThrow();
  });

  it("Rejects impossible count permutations across all games in assertCountBounds", () => {
    // N-Back: hits > targets
    expect(() =>
      assertCountBounds("nback", { trials: 20, targets: 5, hits: 6 }),
    ).toThrow("nback: hits exceed targets");

    // Math: correct + wrong > totalProblems
    expect(() =>
      assertCountBounds("math", { totalProblems: 10, correct: 9, wrong: 3 }),
    ).toThrow("math: answered more problems than served");

    // Stroop: wrong clicks > totalStimuli
    expect(() =>
      assertCountBounds("stroop", { totalStimuli: 20, wrongClicks: 21 }),
    ).toThrow("stroop: wrong clicks exceed stimuli shown");

    // GoNoGo: goTrials + nogoTrials !== trials
    expect(() =>
      assertCountBounds("gonogo", { trials: 30, goTrials: 20, nogoTrials: 9 }),
    ).toThrow("gonogo: go+nogo must equal trials");

    // Mental Rotation: correct + wrong !== trials
    expect(() =>
      assertCountBounds("mental", { trials: 20, correct: 18, wrong: 1 }),
    ).toThrow("mental: correct+wrong must equal trials");

    // Corsi: span > 9
    expect(() => assertCountBounds("corsi", { span: 10, taps: 20 })).toThrow(
      "corsi: span exceeds grid size",
    );

    // Corsi: taps < span
    expect(() => assertCountBounds("corsi", { span: 6, taps: 5 })).toThrow(
      "corsi: fewer taps than the reported span",
    );

    // Trail: nodes < 2
    expect(() => assertCountBounds("trail", { nodes: 1 })).toThrow(
      "trail: too few nodes",
    );

    // Trail: mode !== 'A' && mode !== 'B'
    expect(() => assertCountBounds("trail", { mode: "X", nodes: 20 })).toThrow(
      "trail: mode must be A or B",
    );
  });
});

describe("Milestone 1 Empirical Challenge: Anti-Cheat Bot vs Human Classification", () => {
  it("Fast Bot (<130ms / <150ms) triggers physical hard flag and shouldReject", () => {
    const reactionBot = inspectRound(
      "reaction",
      {
        timeMs: 2000,
        rts: [90, 85, 95, 88, 92, 87, 91, 89, 93, 90],
        falseStarts: 0,
      },
      2000,
    );
    expect(hasHardFlag(reactionBot)).toBe(true);
    expect(shouldReject(reactionBot)).toBe(true);

    const schulteBot = inspectRound(
      "schulte",
      {
        timeMs: 4000,
        cells: 25,
        wrongClicks: 0,
        hitRts: Array(25).fill(120),
        modeLabel: "5x5",
      },
      4000,
    );
    expect(hasHardFlag(schulteBot)).toBe(true);
    expect(shouldReject(schulteBot)).toBe(true);

    const memoryBot = inspectRound(
      "memory",
      {
        timeMs: 1000,
        clearedLevels: 8,
        totalTaps: 40, // 1000/40 = 25ms < 90ms
      },
      1000,
    );
    expect(hasHardFlag(memoryBot)).toBe(true);
    expect(shouldReject(memoryBot)).toBe(true);
  });

  it("Hard Math Bot with perfect score and fast completion (<1200ms) triggers detection", () => {
    const hardMathBot = inspectRound(
      "math",
      {
        timeMs: 15000,
        difficulty: "hard",
        totalProblems: 20,
        correct: 20,
        wrong: 0,
        rts: Array(20).fill(700), // median 700ms < 1200ms
      },
      15000,
    );
    const msgs = hardMathBot.flags.map((f) => f.msg);
    expect(msgs).toContain("Perfect hard math finished too fast");
    expect(msgs).toContain("Math timing too metronomic");
    // 2 statistical flags -> shouldReject = true
    expect(shouldReject(hardMathBot)).toBe(true);
  });

  it("Normal Human & Elite Human Payloads pass cleanly without rejection", () => {
    // Normal Human Reaction Time (mean ~250ms, variable)
    const normalHumanReaction = inspectRound(
      "reaction",
      {
        timeMs: 20000,
        rts: [245, 280, 230, 310, 260, 225, 290, 270, 235, 255],
        falseStarts: 1,
      },
      20000,
    );
    expect(hasHardFlag(normalHumanReaction)).toBe(false);
    expect(shouldReject(normalHumanReaction)).toBe(false);
    expect(normalHumanReaction.flags).toHaveLength(0);

    // Normal Human Hard Math (takes 2-5s per problem, has variance)
    const normalHumanMath = inspectRound(
      "math",
      {
        timeMs: 80000,
        difficulty: "hard",
        totalProblems: 20,
        correct: 18,
        wrong: 2,
        rts: [
          3200, 2800, 4500, 3900, 5100, 2900, 3600, 4200, 3100, 4800, 2700,
          3400, 4100, 3800, 5200, 3000, 3500, 4300, 3300, 4600,
        ],
      },
      80000,
    );
    expect(hasHardFlag(normalHumanMath)).toBe(false);
    expect(shouldReject(normalHumanMath)).toBe(false);
    expect(normalHumanMath.flags).toHaveLength(0);

    // Human with single accidental anticipation tap (100ms) - should NOT hard ban
    const humanWithAnticipation = inspectRound(
      "reaction",
      {
        timeMs: 20000,
        rts: [100, 260, 240, 270, 250, 280, 230, 265, 255, 245],
        falseStarts: 1,
      },
      20000,
    );
    expect(hasHardFlag(humanWithAnticipation)).toBe(false);
    expect(shouldReject(humanWithAnticipation)).toBe(false);
  });
});
