import { adminClient } from "../server/config.ts";

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  rollout_percentage?: number | null;
  updated_at?: string;
};

let cachedFlags: Record<string, FeatureFlag> | null = null;
let lastFetchMs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache TTL in Edge Function memory

/**
 * Retrieves feature flags. Uses an in-memory cache to avoid hammering Postgres.
 * Edge Functions stay "warm" for a while, so this is highly efficient.
 */
export async function getFeatureFlags(): Promise<Record<string, FeatureFlag>> {
  const now = Date.now();
  if (cachedFlags && now - lastFetchMs < CACHE_TTL_MS) {
    return cachedFlags;
  }

  const { data, error } = await adminClient.from("feature_flags").select("*");

  if (error || !data) {
    console.error("Failed to fetch feature flags:", error?.message);
    // Return stale cache if available, else empty
    return cachedFlags || {};
  }

  const newFlags: Record<string, FeatureFlag> = {};
  for (const flag of data) {
    newFlags[flag.key] = flag;
  }

  cachedFlags = newFlags;
  lastFetchMs = now;
  return newFlags;
}

/**
 * Invalidate the Edge Function in-memory feature flags cache.
 */
export function invalidateFlagsCache(): void {
  cachedFlags = null;
  lastFetchMs = 0;
}

/**
 * Deterministic 32-bit FNV-1a hash mapping (userId, flagKey) to an integer [0, 99].
 * Ensures sticky segmentation for gradual rollouts.
 */
export function hashRollout(userId: string, flagKey: string): number {
  const input = `${userId}:${flagKey}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

/**
 * Checks if a specific feature flag is enabled.
 * If rollout_percentage is set, computes deterministic sticky rollout if userId is provided.
 */
export async function isFeatureEnabled(
  key: string,
  userId?: string,
): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flag = flags[key];
  if (!flag) return false; // default false if missing

  if (!flag.enabled) return false;

  if (
    typeof flag.rollout_percentage === "number" &&
    Number.isFinite(flag.rollout_percentage)
  ) {
    if (flag.rollout_percentage <= 0) return false;
    if (flag.rollout_percentage >= 100) return true;
    if (userId) {
      return hashRollout(userId, key) < flag.rollout_percentage;
    }
    return Math.random() * 100 < flag.rollout_percentage;
  }

  return true;
}
