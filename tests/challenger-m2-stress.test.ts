import { describe, expect, it, vi } from "vitest";
import { hashRollout as sharedHashRollout } from "../supabase/functions/_shared/feature-flags";
import {
  hashRollout as clientHashRollout,
  evaluateFlag,
  type FeatureFlag,
} from "../src/app/lib/api/flags";
import { cognitiveIndex, axesCovered } from "../src/app/lib/api/stats";
import { withLock } from "../src/app/lib/offline-queue";
import type { Profile } from "../src/app/lib/api/internal";

describe("Milestone 2 Empirical Challenge: FNV-1a Sticky Hashing Distribution (10,000 Synthetic Users)", () => {
  const NUM_USERS = 10_000;

  // Generate 10,000 realistic synthetic user IDs across multiple ID topologies
  const syntheticUsers: string[] = [];
  for (let i = 0; i < NUM_USERS; i++) {
    if (i < 3000) {
      // UUID-style synthetic IDs
      syntheticUsers.push(
        `usr_${(i * 104729).toString(16).padStart(8, "0")}-4000-8000-000000000000`,
      );
    } else if (i < 6000) {
      // Alphanumeric slugs / usernames
      syntheticUsers.push(`player_alpha_num_${i}_test`);
    } else if (i < 8500) {
      // Sequential zero-padded IDs
      syntheticUsers.push(`usr-seq-${i.toString().padStart(6, "0")}`);
    } else {
      // Email-like pseudonyms
      syntheticUsers.push(`user_${i}@mindgem.local`);
    }
  }

  it("Equivalence Invariant: Backend and Client hashRollout produce 100% identical results for 10,000 users", () => {
    const flagKey = "game_visual_search";
    for (let i = 0; i < NUM_USERS; i++) {
      const uid = syntheticUsers[i];
      const sharedH = sharedHashRollout(uid, flagKey);
      const clientH = clientHashRollout(uid, flagKey);

      expect(sharedH).toBe(clientH);
      expect(Number.isInteger(sharedH)).toBe(true);
      expect(sharedH).toBeGreaterThanOrEqual(0);
      expect(sharedH).toBeLessThan(100);
    }
  });

  it("Determinism Invariant: 10,000 users produce exact identical hash across multiple runs (Sticky Invariant)", () => {
    const flagKey = "game_nback_speed";
    for (let i = 0; i < NUM_USERS; i++) {
      const uid = syntheticUsers[i];
      const run1 = clientHashRollout(uid, flagKey);
      const run2 = clientHashRollout(uid, flagKey);
      const run3 = clientHashRollout(uid, flagKey);

      expect(run1).toBe(run2);
      expect(run2).toBe(run3);
    }
  });

  it("Rollout Distribution: 0%, 25%, 50%, 75%, 100% across 10,000 users meet strict statistical bounds", () => {
    const flagKey = "experimental_feature_rollout";

    let enabled0 = 0;
    let enabled25 = 0;
    let enabled50 = 0;
    let enabled75 = 0;
    let enabled100 = 0;

    const flag0: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 0,
    };
    const flag25: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 25,
    };
    const flag50: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 50,
    };
    const flag75: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 75,
    };
    const flag100: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 100,
    };

    for (const uid of syntheticUsers) {
      if (evaluateFlag(flag0, uid)) enabled0++;
      if (evaluateFlag(flag25, uid)) enabled25++;
      if (evaluateFlag(flag50, uid)) enabled50++;
      if (evaluateFlag(flag75, uid)) enabled75++;
      if (evaluateFlag(flag100, uid)) enabled100++;
    }

    // 0% rollout must enable EXACTLY 0 users
    expect(enabled0).toBe(0);

    // 100% rollout must enable EXACTLY 10,000 users
    expect(enabled100).toBe(NUM_USERS);

    // 25% rollout: expected 2500, binomial 3-sigma is [2370, 2630]
    expect(enabled25).toBeGreaterThanOrEqual(2370);
    expect(enabled25).toBeLessThanOrEqual(2630);

    // 50% rollout: expected 5000, binomial 3-sigma is [4850, 5150]
    expect(enabled50).toBeGreaterThanOrEqual(4850);
    expect(enabled50).toBeLessThanOrEqual(5150);

    // 75% rollout: expected 7500, binomial 3-sigma is [7370, 7630]
    expect(enabled75).toBeGreaterThanOrEqual(7370);
    expect(enabled75).toBeLessThanOrEqual(7630);
  });

  it("Monotonic Stickiness Invariant: A user enabled at lower rollout percentage NEVER gets disabled at higher rollout", () => {
    const flagKey = "game_corsi_3d";

    const flag10: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 10,
    };
    const flag25: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 25,
    };
    const flag50: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 50,
    };
    const flag75: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 75,
    };
    const flag90: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rollout_percentage: 90,
    };

    for (const uid of syntheticUsers) {
      const is10 = evaluateFlag(flag10, uid);
      const is25 = evaluateFlag(flag25, uid);
      const is50 = evaluateFlag(flag50, uid);
      const is75 = evaluateFlag(flag75, uid);
      const is90 = evaluateFlag(flag90, uid);

      if (is10) {
        expect(is25).toBe(true);
        expect(is50).toBe(true);
        expect(is75).toBe(true);
        expect(is90).toBe(true);
      }
      if (is25) {
        expect(is50).toBe(true);
        expect(is75).toBe(true);
        expect(is90).toBe(true);
      }
      if (is50) {
        expect(is75).toBe(true);
        expect(is90).toBe(true);
      }
      if (is75) {
        expect(is90).toBe(true);
      }
    }
  });

  it("Uniform Bucket Distribution: FNV-1a populates all 100 buckets with low Chi-Square variance", () => {
    const flagKey = "game_reaction_v2";
    const buckets = new Array(100).fill(0);

    for (const uid of syntheticUsers) {
      const bucket = clientHashRollout(uid, flagKey);
      buckets[bucket]++;
    }

    // Every single bucket [0..99] should receive items
    for (let b = 0; b < 100; b++) {
      expect(buckets[b]).toBeGreaterThan(50); // Expected ~100 per bucket
      expect(buckets[b]).toBeLessThan(150);
    }

    // Chi-Square statistic test for uniform distribution across 100 buckets
    const expected = NUM_USERS / 100; // 100
    let chiSquare = 0;
    for (let b = 0; b < 100; b++) {
      chiSquare += (buckets[b] - expected) ** 2 / expected;
    }
    // Critical value for df=99 at p=0.001 is ~148.6
    expect(chiSquare).toBeLessThan(160);
  });

  it("Handles extreme user ID edge cases without exceptions or NaN", () => {
    const flag: FeatureFlag = {
      key: "edge_flag",
      enabled: true,
      rollout_percentage: 50,
    };

    const edgeCases = [
      "",
      " ",
      "   \t\n  ",
      "a".repeat(10_000),
      "特殊文字_日本語_🔥_✨",
      "!@#$%^&*()_+=-~`{}[]|;:'\"<>,.?/",
      "null",
      "undefined",
      "0",
      "-1",
    ];

    for (const edgeId of edgeCases) {
      const h = clientHashRollout(edgeId, "edge_flag");
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(100);

      const evalResult = evaluateFlag(flag, edgeId);
      expect(typeof evalResult).toBe("boolean");
    }
  });
});

describe("Milestone 2 Empirical Challenge: Feature Flag Mutation Validation & Adversarial Payloads", () => {
  // Validator logic under test conforming to routes/flags.ts
  function validateAdminFlagPayload(body: Record<string, unknown>): {
    valid: boolean;
    error?: string;
    normalized?: Record<string, unknown>;
  } {
    const { key, enabled } = body;
    const rollout =
      body.rollout_percentage !== undefined
        ? body.rollout_percentage
        : body.rolloutPercentage !== undefined
          ? body.rolloutPercentage
          : null;

    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return { valid: false, error: "Missing or invalid flag key" };
    }

    if (typeof enabled !== "boolean") {
      return { valid: false, error: "Flag enabled must be boolean" };
    }

    if (
      rollout !== null &&
      rollout !== undefined &&
      (typeof rollout !== "number" ||
        !Number.isFinite(rollout) ||
        rollout < 0 ||
        rollout > 100)
    ) {
      return {
        valid: false,
        error: "Rollout percentage must be between 0 and 100 or null",
      };
    }

    const normalizedRollout =
      rollout === null || rollout === undefined
        ? null
        : Math.round(rollout as number);
    const normalizedKey = key.trim();

    return {
      valid: true,
      normalized: {
        key: normalizedKey,
        enabled,
        rollout_percentage: normalizedRollout,
      },
    };
  }

  it("Rejects invalid and empty keys", () => {
    expect(validateAdminFlagPayload({ key: "", enabled: true }).valid).toBe(
      false,
    );
    expect(validateAdminFlagPayload({ key: "   ", enabled: true }).valid).toBe(
      false,
    );
    expect(
      validateAdminFlagPayload({
        key: null as unknown as string,
        enabled: true,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: undefined as unknown as string,
        enabled: true,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: 123 as unknown as string,
        enabled: true,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: {} as unknown as string,
        enabled: true,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: [] as unknown as string,
        enabled: true,
      }).valid,
    ).toBe(false);
  });

  it("Rejects non-boolean enabled parameter", () => {
    expect(
      validateAdminFlagPayload({
        key: "valid_key",
        enabled: "true" as unknown as boolean,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "valid_key",
        enabled: 1 as unknown as boolean,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "valid_key",
        enabled: null as unknown as boolean,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "valid_key",
        enabled: undefined as unknown as boolean,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "valid_key",
        enabled: {} as unknown as boolean,
      }).valid,
    ).toBe(false);
  });

  it("Rejects negative, excessive (>100), and non-finite rollout percentages", () => {
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: -1,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: -100,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: 101,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: 500,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: NaN,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: Infinity,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: -Infinity,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: "50" as unknown as number,
      }).valid,
    ).toBe(false);
    expect(
      validateAdminFlagPayload({
        key: "k",
        enabled: true,
        rollout_percentage: {} as unknown as number,
      }).valid,
    ).toBe(false);
  });

  it("Accepts valid rollout percentages and normalizes snake_case / camelCase", () => {
    const res1 = validateAdminFlagPayload({
      key: "  game_new_feature  ",
      enabled: true,
      rollout_percentage: 50,
    });
    expect(res1.valid).toBe(true);
    expect(res1.normalized?.key).toBe("game_new_feature");
    expect(res1.normalized?.rollout_percentage).toBe(50);

    const res2 = validateAdminFlagPayload({
      key: "game_camel",
      enabled: false,
      rolloutPercentage: 75.4,
    });
    expect(res2.valid).toBe(true);
    expect(res2.normalized?.rollout_percentage).toBe(75);

    const res3 = validateAdminFlagPayload({
      key: "game_null_rollout",
      enabled: true,
      rollout_percentage: null,
    });
    expect(res3.valid).toBe(true);
    expect(res3.normalized?.rollout_percentage).toBeNull();
  });
});

describe("Milestone 2 Empirical Challenge: Offline Queue Fallback & Rapid Concurrent Execution", () => {
  it("Executes 100 rapid concurrent withLock operations without race conditions or deadlocks", async () => {
    let counter = 0;
    const promises: Promise<number>[] = [];

    // Simulate 100 concurrent callers
    for (let i = 0; i < 100; i++) {
      promises.push(
        withLock("test-concurrency-lock", async () => {
          const current = counter;
          // small async tick
          await new Promise((res) => setTimeout(res, 1));
          counter = current + 1;
          return counter;
        }),
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(counter).toBe(100);
  });

  it("Recovers gracefully when navigator.locks.request throws lock acquisition error", async () => {
    const originalNavigator = globalThis.navigator;

    try {
      // Mock navigator with locks API that always fails / aborts
      Object.defineProperty(globalThis, "navigator", {
        value: {
          locks: {
            request: vi.fn(async () => {
              throw new Error(
                "Lock acquisition aborted or forbidden in sandbox",
              );
            }),
          },
          onLine: true,
        },
        writable: true,
        configurable: true,
      });

      let executed = false;
      const result = await withLock("fallback-on-error-lock", async () => {
        executed = true;
        return "fallback-recovered";
      });

      expect(executed).toBe(true);
      expect(result).toBe("fallback-recovered");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }
  });

  it("Propagates exceptions thrown inside withLock callback to caller", async () => {
    await expect(
      withLock("error-inside-lock", async () => {
        throw new Error("Internal processing failure");
      }),
    ).rejects.toThrow("Internal processing failure");
  });
});

describe("Milestone 2 Empirical Challenge: Cognitive Index & Active Axes Integrity", () => {
  const mockBase: Profile = {
    id: "p_test_123",
    username: "challenger_tester",
    cfop_spatial_record: null,
    spatial_score: 0,
    algebraic_logic_score: 0,
    memory_score: 0,
    speed_score: 0,
    focus_score: 0,
    total_xp: 1200,
    last_active_date: "2026-09-01",
    birth_year: 1995,
    avatar_url: null,
    role: "user",
    created_at: "2026-01-01T00:00:00Z",
    schulte_sessions: 10,
    sudoku_sessions: 5,
    stroop_sessions: 0,
    reaction_sessions: 0,
    memory_sessions: 0,
    nback_sessions: 0,
    math_sessions: 0,
    gonogo_sessions: 0,
    mental_sessions: 0,
    corsi_sessions: 0,
    trail_sessions: 0,
    search_sessions: 0,
  };

  it("axesCovered returns exact count of non-zero active axes [0..5]", () => {
    expect(axesCovered(mockBase)).toBe(0);

    const p1 = { ...mockBase, algebraic_logic_score: 750 };
    expect(axesCovered(p1)).toBe(1);

    const p3 = {
      ...mockBase,
      algebraic_logic_score: 750,
      memory_score: 680,
      focus_score: 820,
    };
    expect(axesCovered(p3)).toBe(3);

    const p5 = {
      ...mockBase,
      algebraic_logic_score: 750,
      memory_score: 680,
      focus_score: 820,
      speed_score: 900,
      cfop_spatial_record: 850,
    };
    expect(axesCovered(p5)).toBe(5);
  });

  it("cognitiveIndex calculates exact active-axis arithmetic mean without distortion", () => {
    // 1 axis
    expect(cognitiveIndex({ ...mockBase, memory_score: 840 })).toBe(840);

    // 2 axes: (800 + 600) / 2 = 700
    expect(
      cognitiveIndex({
        ...mockBase,
        memory_score: 800,
        speed_score: 600,
      }),
    ).toBe(700);

    // 4 axes: (1000 + 800 + 600 + 400) / 4 = 700
    expect(
      cognitiveIndex({
        ...mockBase,
        algebraic_logic_score: 1000,
        focus_score: 800,
        speed_score: 600,
        cfop_spatial_record: 400,
      }),
    ).toBe(700);

    // Handles NaN/Infinity/null values defensively
    expect(
      cognitiveIndex({
        ...mockBase,
        algebraic_logic_score: NaN as unknown as number,
        memory_score: 900,
        speed_score: null as unknown as number,
      }),
    ).toBe(900);
  });
});
