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
  if (cachedFlags && (now - lastFetchMs < CACHE_TTL_MS)) {
    return cachedFlags;
  }

  const { data, error } = await adminClient
    .from("feature_flags")
    .select("*");

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
 * Checks if a specific feature flag is enabled.
 * If rollout_percentage is set, it checks against a random value (0-100).
 * Note: A proper rollout check would hash the user ID to ensure consistent 
 * experience per user, but for now we just return the boolean state.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flag = flags[key];
  if (!flag) return false; // default false if missing
  
  if (!flag.enabled) return false;
  
  // Basic rollout check (not sticky per user)
  if (typeof flag.rollout_percentage === "number") {
    return (Math.random() * 100) <= flag.rollout_percentage;
  }
  
  return true;
}
