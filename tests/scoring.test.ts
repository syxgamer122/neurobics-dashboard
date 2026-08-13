import { describe, expect, it } from "vitest";
import {
  sanitizeRating,
  pullUpRating,
  decayRating,
  daysSince,
  percentileOf,
  calcBrainAge,
  MAX_AGE_SWING,
} from "../src/app/lib/scoring";

describe("sanitizeRating", () => {
  it("keeps valid ratings", () => {
    expect(sanitizeRating(999)).toBe(999);
    expect(sanitizeRating(1000)).toBe(1000);
  });

  it("clamps tiny overflow, zeros legacy totals", () => {
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

describe("decayRating", () => {
  it("keeps values inside grace window", () => {
    expect(decayRating(800, 0)).toBe(800);
    expect(decayRating(800, 7)).toBe(800);
  });

  it.skip("decays after grace and floors at 35% (disabled until peak tracking is implemented)", () => {
    expect(decayRating(800, 14)).toBeCloseTo(800 * 0.98, 0);
    expect(decayRating(800, 35)).toBeCloseTo(800 * Math.pow(0.98, 4), 0);
    expect(decayRating(800, 3650)).toBeCloseTo(280, 0);
    expect(decayRating(0, 999)).toBe(0);
  });
});

describe("daysSince (VN calendar)", () => {
  const now = new Date("2026-08-02T00:00:00.000Z");

  it("counts whole VN calendar days", () => {
    expect(daysSince("2026-08-02", now)).toBe(0);
    expect(daysSince("2026-08-01", now)).toBe(1);
    expect(daysSince("2026-06-03", now)).toBe(60);
    expect(daysSince("2026-09-01", now)).toBe(0);
    expect(daysSince(null, now)).toBe(0);
  });

  it("handles early VN morning without timezone slip", () => {
    const earlyVn = new Date("2026-08-01T23:30:00.000Z");
    expect(daysSince("2026-08-02", earlyVn)).toBe(0);
  });
});

describe("percentileOf", () => {
  const pop = { mean: 400, sd: 150, n: 120 };

  it("maps mean and ±1sd", () => {
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
    expect(mean.delta).toBe(0);
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
