/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import { describe, expect, it } from "vitest";

// Import all scoring functions directly from standard-games.ts since client imports are restricted
import {
  scoreSchulte,
  scoreSudoku,
  scoreStroop,
  scoreReaction,
  scoreMemory,
  scoreMath,
} from "../supabase/functions/_shared/scoring/standard-games";

const TIME_FREE_AXES = ["logic", "memory"] as const;

const GAMES = {
  schulte: {
    fn: scoreSchulte,
    base: {
      cells: 25,
      hitRts: Array(25).fill(800),
      timeMs: 25 * 800,
      wrongClicks: 0,
    },
  },
  sudoku: {
    fn: scoreSudoku,
    base: {
      difficulty: "Medium",
      placements: 20,
      moveRts: Array(20).fill(1500),
      mistakes: 0,
      reEntries: 0,
      repeatMistakes: 0,
      actualClues: 30,
    },
  },
  stroop: {
    fn: scoreStroop,
    base: { totalStimuli: 30, wrongClicks: 0, rts: Array(30).fill(1000) },
  },
  reaction: {
    fn: scoreReaction,
    base: { rts: Array(10).fill(300), falseStarts: 0 },
  },
  memory: {
    fn: scoreMemory,
    base: { clearedLevels: 5, maxLevel: 5, wrongClicks: 0 },
  },
  math: {
    fn: scoreMath,
    base: {
      difficulty: "medium",
      totalProblems: 20,
      correct: 20,
      wrong: 0,
      rts: Array(20).fill(1500),
    },
  },
};

describe("Orthogonality Test", () => {
  for (const [game, { fn, base }] of Object.entries(GAMES)) {
    it(`${game}: logic/memory không phụ thuộc thời gian`, () => {
      // Provide valid timeMs
      const fastBase = { ...base, timeMs: 10000 };
      const slowBase = { ...base, timeMs: 60000 };

      const fastRts = (base as any).rts ? (base as any).rts.map(() => 400) : [];
      const slowRts = (base as any).rts
        ? (base as any).rts.map(() => 2500)
        : [];

      const fast = fn({ ...fastBase, rts: fastRts, moveRts: fastRts });
      const slow = fn({ ...slowBase, rts: slowRts, moveRts: slowRts });

      for (const axis of TIME_FREE_AXES) {
        if (fast.axes[axis] !== undefined) {
          expect(fast.axes[axis]).toBe(slow.axes[axis]);
        }
      }

      if (
        fastRts.length > 0 &&
        fast.axes.speed !== undefined &&
        fast.axes.speed !== null
      ) {
        // speed should be greater for fast (unless capped at MAX)
        expect(fast.axes.speed).toBeGreaterThanOrEqual(slow.axes.speed!);
      }
    });
  }
});
