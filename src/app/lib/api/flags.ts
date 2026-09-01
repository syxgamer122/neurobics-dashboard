/**
 * Feature Flags API: client-side fetching, deterministic evaluation, and admin mutation.
 */
import { getSupabase, serverPost, serverGet } from "./internal";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rollout_percentage?: number | null;
  updated_at?: string;
}

export interface FeatureFlagUpdate {
  key: string;
  enabled: boolean;
  rollout_percentage?: number | null;
  rolloutPercentage?: number | null;
}

/**
 * Deterministic 32-bit FNV-1a hash mapping (userId, flagKey) to an integer [0, 99].
 * Guarantees consistent user segmentation across sessions.
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
 * Evaluates whether a flag is enabled for a given user.
 * If rollout_percentage is set, evaluates deterministically using user ID hash.
 */
export function evaluateFlag(
  flag?: FeatureFlag | null,
  userId?: string | null,
): boolean {
  if (!flag) return true; // Default fallback to true if flag is not explicitly registered
  if (!flag.enabled) return false;

  if (
    typeof flag.rollout_percentage === "number" &&
    Number.isFinite(flag.rollout_percentage)
  ) {
    if (flag.rollout_percentage <= 0) return false;
    if (flag.rollout_percentage >= 100) return true;
    if (userId) {
      return hashRollout(userId, flag.key) < flag.rollout_percentage;
    }
    return true;
  }

  return true;
}

/**
 * Fetches all feature flags from the server.
 */
export async function fetchFeatureFlags(): Promise<
  Record<string, FeatureFlag>
> {
  try {
    const result = await serverGet<{ flags: Record<string, FeatureFlag> }>(
      "flags",
    );
    if (result && result.flags) {
      return result.flags;
    }
  } catch {
    // Fallback to anonymous fetch or direct query if unauthenticated
  }

  try {
    const { data, error } = await getSupabase()
      .from("feature_flags")
      .select("*");
    if (!error && data) {
      const flags: Record<string, FeatureFlag> = {};
      for (const f of data as FeatureFlag[]) {
        flags[f.key] = f;
      }
      return flags;
    }
  } catch {
    // Return empty if offline or tables missing
  }

  return {};
}

/**
 * Admin mutation to toggle a flag and/or set its rollout percentage.
 */
export async function adminUpdateFeatureFlag(
  flag: FeatureFlagUpdate,
): Promise<FeatureFlag> {
  const payload = {
    key: flag.key,
    enabled: flag.enabled,
    rollout_percentage:
      flag.rollout_percentage !== undefined
        ? flag.rollout_percentage
        : flag.rolloutPercentage !== undefined
          ? flag.rolloutPercentage
          : null,
  };
  const result = await serverPost<{ success: boolean; flag: FeatureFlag }>(
    "admin-flags",
    payload,
  );
  return result.flag;
}
