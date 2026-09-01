import { useCallback, useEffect, useState } from "react";
import {
  fetchFeatureFlags,
  adminUpdateFeatureFlag,
  evaluateFlag,
  type FeatureFlag,
} from "../lib/api/flags";

export function useFeatureFlags(userId?: string | null) {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetched = await fetchFeatureFlags();
      setFlags(fetched);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFlags();
  }, [refreshFlags]);

  const isEnabled = useCallback(
    (key: string): boolean => {
      const flag = flags[key];
      return evaluateFlag(flag, userId);
    },
    [flags, userId],
  );

  const updateFlag = useCallback(
    async (
      key: string,
      enabled: boolean,
      rollout_percentage?: number | null,
    ): Promise<FeatureFlag> => {
      const previous = flags[key];
      const optimistic: FeatureFlag = {
        key,
        enabled,
        rollout_percentage: rollout_percentage ?? null,
        updated_at: new Date().toISOString(),
      };
      setFlags((prev) => ({ ...prev, [key]: optimistic }));

      try {
        const updated = await adminUpdateFeatureFlag({
          key,
          enabled,
          rollout_percentage,
        });
        setFlags((prev) => ({ ...prev, [key]: updated }));
        return updated;
      } catch (err) {
        if (previous) {
          setFlags((prev) => ({ ...prev, [key]: previous }));
        } else {
          setFlags((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        throw err;
      }
    },
    [flags],
  );

  const setAllFlags = useCallback(
    async (enabled: boolean): Promise<void> => {
      const keys = Object.keys(flags);
      if (keys.length === 0) return;
      const updates = keys.map((key) =>
        adminUpdateFeatureFlag({
          key,
          enabled,
          rollout_percentage: flags[key]?.rollout_percentage ?? null,
        }),
      );
      await Promise.allSettled(updates);
      await refreshFlags();
    },
    [flags, refreshFlags],
  );

  return {
    flags,
    loading,
    error,
    isEnabled,
    updateFlag,
    refreshFlags,
    setAllFlags,
  };
}
