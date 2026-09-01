import { describe, expect, it, vi } from "vitest";
import { hashRollout as sharedHashRollout } from "../supabase/functions/_shared/feature-flags";
import {
  hashRollout as clientHashRollout,
  evaluateFlag,
  type FeatureFlag,
} from "../src/app/lib/api/flags";
import { cognitiveIndex } from "../src/app/lib/api/stats";
import { withLock } from "../src/app/lib/offline-queue";
import type { Profile } from "../src/app/lib/api/internal";

describe("Deterministic Sticky Rollout Hashing", () => {
  it("shared and client hashRollout produce identical deterministic results", () => {
    const testCases = [
      { userId: "usr_1001", key: "game_nback" },
      { userId: "usr_1002", key: "game_schulte" },
      { userId: "usr_1003", key: "game_mental" },
      { userId: "usr_1004", key: "experimental_ai" },
      { userId: "usr_alpha_999", key: "arcade_dino" },
    ];

    for (const { userId, key } of testCases) {
      const sharedHash = sharedHashRollout(userId, key);
      const clientHash = clientHashRollout(userId, key);

      expect(sharedHash).toBe(clientHash);
      expect(Number.isInteger(sharedHash)).toBe(true);
      expect(sharedHash).toBeGreaterThanOrEqual(0);
      expect(sharedHash).toBeLessThan(100);
    }
  });

  it("produces identical hashes for repeated calls (sticky invariant)", () => {
    const userId = "fixed_user_uuid_12345";
    const key = "game_sudoku";

    const hash1 = clientHashRollout(userId, key);
    const hash2 = clientHashRollout(userId, key);
    const hash3 = clientHashRollout(userId, key);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it("distributes distinct feature keys independently for the same user", () => {
    const userId = "user_consistent_id_888";
    const flags = [
      "game_schulte",
      "game_sudoku",
      "game_stroop",
      "game_reaction",
      "game_memory",
      "game_nback",
      "game_math",
      "game_gonogo",
      "game_mental",
      "game_corsi",
    ];

    const hashes = flags.map((k) => clientHashRollout(userId, k));
    const uniqueHashes = new Set(hashes);
    // Across 10 flags, we expect high entropy (not all mapping to same bucket)
    expect(uniqueHashes.size).toBeGreaterThan(5);
  });

  it("rollout 0% disables for all users, 100% enables for all users", () => {
    const flag0: FeatureFlag = {
      key: "game_experimental",
      enabled: true,
      rollout_percentage: 0,
    };
    const flag100: FeatureFlag = {
      key: "game_standard",
      enabled: true,
      rollout_percentage: 100,
    };

    for (let i = 0; i < 50; i++) {
      const uid = `user_random_${i}`;
      expect(evaluateFlag(flag0, uid)).toBe(false);
      expect(evaluateFlag(flag100, uid)).toBe(true);
    }
  });

  it("rollout 50% partitions users consistently", () => {
    const flag50: FeatureFlag = {
      key: "game_beta",
      enabled: true,
      rollout_percentage: 50,
    };

    let enabledCount = 0;
    const totalUsers = 200;

    for (let i = 0; i < totalUsers; i++) {
      const uid = `user_partition_test_${i}`;
      if (evaluateFlag(flag50, uid)) {
        enabledCount++;
      }
    }

    // 50% rollout across 200 pseudo-random users should be close to 100 (e.g. 40% - 60%)
    expect(enabledCount).toBeGreaterThanOrEqual(70);
    expect(enabledCount).toBeLessThanOrEqual(130);
  });

  it("disabled flag is always false regardless of rollout percentage", () => {
    const disabledFlag: FeatureFlag = {
      key: "game_maint",
      enabled: false,
      rollout_percentage: 100,
    };

    expect(evaluateFlag(disabledFlag, "any_user")).toBe(false);
    expect(evaluateFlag(disabledFlag, null)).toBe(false);
  });

  it("missing flag defaults to true (safe fallback for games)", () => {
    expect(evaluateFlag(null, "user_123")).toBe(true);
    expect(evaluateFlag(undefined, "user_123")).toBe(true);
  });
});

describe("Cognitive Index Calculation Alignment (Active-Axis Arithmetic Mean)", () => {
  const baseProfile: Profile = {
    id: "profile_1",
    username: "player1",
    cfop_spatial_record: null,
    spatial_score: 0,
    algebraic_logic_score: 0,
    memory_score: 0,
    speed_score: 0,
    focus_score: 0,
    total_xp: 500,
    last_active_date: "2026-09-01",
    birth_year: 2000,
    avatar_url: null,
    role: "user",
    created_at: "2026-01-01T00:00:00Z",
    schulte_sessions: 0,
    sudoku_sessions: 0,
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

  it("returns 0 if no active axes", () => {
    expect(cognitiveIndex(baseProfile)).toBe(0);
  });

  it("returns exact rating when only 1 axis is active (no shrinkage penalty)", () => {
    const singleAxisProfile: Profile = {
      ...baseProfile,
      algebraic_logic_score: 800,
    };
    // Prior bug applied 0.4 coverage penalty: 800 * (0.4 + 0.6 * 0.2) = 416
    // Correct aligned behavior: pure arithmetic mean of active axes = 800
    expect(cognitiveIndex(singleAxisProfile)).toBe(800);
  });

  it("computes exact arithmetic mean of 3 active axes", () => {
    const multiAxisProfile: Profile = {
      ...baseProfile,
      algebraic_logic_score: 600,
      memory_score: 700,
      speed_score: 800,
    };
    expect(cognitiveIndex(multiAxisProfile)).toBeCloseTo((600 + 700 + 800) / 3);
  });

  it("computes exact arithmetic mean of all 5 active axes", () => {
    const fullProfile: Profile = {
      ...baseProfile,
      algebraic_logic_score: 500,
      focus_score: 600,
      speed_score: 700,
      memory_score: 800,
      cfop_spatial_record: 900,
    };
    expect(cognitiveIndex(fullProfile)).toBe(700);
  });
});

describe("Offline Queue Lock Fallback", () => {
  it("withLock executes callback directly when navigator.locks is unavailable", async () => {
    // Save original navigator
    const originalNavigator = globalThis.navigator;

    try {
      // Mock navigator without locks
      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: true },
        writable: true,
        configurable: true,
      });

      let executed = false;
      const result = await withLock("test-lock", async () => {
        executed = true;
        return "fallback-success";
      });

      expect(executed).toBe(true);
      expect(result).toBe("fallback-success");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }
  });

  it("withLock utilizes navigator.locks.request when available", async () => {
    const originalNavigator = globalThis.navigator;

    try {
      const mockRequest = vi.fn(
        async (_name: string, fn: () => Promise<unknown>) => {
          return await fn();
        },
      );

      Object.defineProperty(globalThis, "navigator", {
        value: {
          locks: { request: mockRequest },
          onLine: true,
        },
        writable: true,
        configurable: true,
      });

      const result = await withLock("sync-lock-1", async () => "lock-acquired");

      expect(mockRequest).toHaveBeenCalledWith(
        "sync-lock-1",
        expect.any(Function),
      );
      expect(result).toBe("lock-acquired");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe("Dynamic Feature Flag Gating Logic", () => {
  it("filters game IDs based on feature flags", () => {
    const flags: Record<string, FeatureFlag> = {
      game_nback: { key: "game_nback", enabled: true, rollout_percentage: 100 },
      game_schulte: {
        key: "game_schulte",
        enabled: false,
        rollout_percentage: 100,
      },
      game_sudoku: { key: "game_sudoku", enabled: true, rollout_percentage: 0 },
    };

    const isGameEnabled = (
      gameId: string,
      userId?: string,
      isAdmin: boolean = false,
    ) => {
      if (isAdmin) return true;
      const flag = flags[`game_${gameId}`];
      return evaluateFlag(flag, userId);
    };

    // Regular user
    expect(isGameEnabled("nback", "user_1", false)).toBe(true);
    expect(isGameEnabled("schulte", "user_1", false)).toBe(false);
    expect(isGameEnabled("sudoku", "user_1", false)).toBe(false);

    // Admin bypasses disabled flags
    expect(isGameEnabled("schulte", "admin_1", true)).toBe(true);
    expect(isGameEnabled("sudoku", "admin_1", true)).toBe(true);
  });
});
