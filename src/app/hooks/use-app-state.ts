import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  getAccessToken,
  getSupabase,
  fetchProfile,
  handleLogout,
  saveBirthDate,
  fetchPopulationStats,
  fetchActivityStats,
  type Profile,
  type ActivityStats,
  type RoundGame,
  isNetworkErrorLike,
  isGuestProfile,
  currentUserId,
} from "../lib/api";
import {
  DEFAULT_POPULATION,
  type PopulationStats,
} from "../lib/provisional-score";
import { totalSessions } from "../lib/sessions";
import { logError } from "../lib/logger";
import { CALIBRATION_TARGET } from "../components/onboarding";
import { type Translation } from "../lib/i18n";
import type { DockPage } from "../components/floating-dock";
import type { RoundResult } from "../components/ui/round-result-overlay";

export const CACHED_PROFILE_KEY = "mindgem.cached_profile";
const CACHE_TTL_MS = 7 * 24 * 3600_000;

type CachedProfile = {
  userId: string;
  profile: Profile;
  at: string;
};

export function useAppState(t: Translation) {
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    try {
      if (p) {
        (async () => {
          const userId = await currentUserId();
          if (userId && p.id === userId) {
            localStorage.setItem(
              CACHED_PROFILE_KEY,
              JSON.stringify({
                userId: p.id,
                profile: p,
                at: new Date().toISOString(),
              }),
            );
          }
        })();
      } else {
        localStorage.removeItem(CACHED_PROFILE_KEY);
      }
    } catch {
      // Ignore quota/private mode errors
    }
  }, []);

  useEffect(() => {
    profileRef.current = profileState;
  }, [profileState]);

  const [activePage, setActivePage] = useState<DockPage>("dashboard");
  const [selectedGame, setSelectedGame] = useState<RoundGame | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [gamificationKey, setGamificationKey] = useState(0);
  const [popStats, setPopStats] = useState<PopulationStats>(DEFAULT_POPULATION);
  const [birthYearInput, setBirthYearInput] = useState("");
  const [savingAge, setSavingAge] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [showCalibrationComplete, setShowCalibrationComplete] = useState(false);
  const previousRoundsRef = useRef<number | null>(null);

  const roundsPlayed = profileState ? totalSessions(profileState) : 0;

  const onboardingStorageKey = (profileId: string) =>
    `nb_onboarding_seen_${profileId}`;

  const markOnboardingSeen = useCallback(() => {
    if (profileState?.id) {
      try {
        localStorage.setItem(onboardingStorageKey(profileState.id), "1");
      } catch {
        // Thu muc luu the co the bi khoa o private mode.
      }
    }
    setOnboardingDismissed(true);
    setOnboardingOpen(false);
  }, [profileState?.id]);

  const goToCalibration = useCallback(() => {
    markOnboardingSeen();
    setSelectedGame(null);
    setActivePage("play");
  }, [markOnboardingSeen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (cancelled) return;
        if (token) {
          try {
            const p = await fetchProfile();
            if (!cancelled) setProfile(p);
          } catch (err) {
            if (isNetworkErrorLike(err)) {
              try {
                const userId = await currentUserId();
                if (cancelled) return;
                const cachedStr = localStorage.getItem(CACHED_PROFILE_KEY);
                const cached = cachedStr
                  ? (JSON.parse(cachedStr) as CachedProfile)
                  : null;
                if (
                  cached?.userId === userId &&
                  Date.now() - Date.parse(cached.at) < CACHE_TTL_MS
                ) {
                  if (!cancelled) setProfile(cached.profile);
                  return;
                }
              } catch (e) {
                logError("Failed to parse cached profile", e);
              }
            }
            throw err;
          }
        }
      } catch (err) {
        logError("Session restore error:", err);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setProfile]);

  // Keep profile in sync across token expiry, multi-tab and remote logout.
  // Restore effect above already handles INITIAL_SESSION — skip it here to
  // avoid a double-fetch on mount.
  useEffect(() => {
    let cancelled = false;
    const { data } = getSupabase().auth.onAuthStateChange(
      async (event, session) => {
        try {
          // Cast: AuthChangeEvent union varies by supabase-js version and may
          // omit SIGNED_OUT / TOKEN_REFRESH_FAILED / USER_DELETED.
          const ev = event as string;
          if (ev === "INITIAL_SESSION") return;
          if (
            (ev === "SIGNED_IN" ||
              ev === "TOKEN_REFRESHED" ||
              ev === "USER_UPDATED") &&
            session
          ) {
            try {
              const p = await fetchProfile();
              if (!cancelled) setProfile(p);
            } catch (err) {
              // Offline: fall back to the 7-day cached profile like above.
              if (isNetworkErrorLike(err)) {
                try {
                  const userId = session.user?.id ?? (await currentUserId());
                  if (cancelled) return;
                  const cachedStr = localStorage.getItem(CACHED_PROFILE_KEY);
                  const cached = cachedStr
                    ? (JSON.parse(cachedStr) as CachedProfile)
                    : null;
                  if (
                    cached?.userId === userId &&
                    Date.now() - Date.parse(cached.at) < CACHE_TTL_MS
                  ) {
                    if (!cancelled) setProfile(cached.profile);
                    return;
                  }
                } catch (e) {
                  logError("Failed to parse cached profile", e);
                }
              }
              logError("Auth state profile fetch error:", err);
            }
          } else if (
            ev === "SIGNED_OUT" ||
            ev === "TOKEN_REFRESH_FAILED" ||
            ev === "USER_DELETED"
          ) {
            // Remote logout: mirror onLogout state reset WITHOUT calling
            // handleLogout again (would loop via signOut -> SIGNED_OUT).
            if (cancelled) return;
            setProfile(null);
            setAdminPanelOpen(false);
            setSelectedGame(null);
            setActivePage("dashboard");
            setOnboardingOpen(false);
            setOnboardingDismissed(false);
          }
        } catch (err) {
          logError("Auth state change error:", err);
        }
      },
    );
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [setProfile]);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await fetchProfile());
    } catch (err) {
      logError("Refresh profile error:", err);
    }
  }, [setProfile]);

  useEffect(() => {
    const handleSyncComplete = () => {
      void refreshProfile();
    };
    window.addEventListener("offline-sync-complete", handleSyncComplete);
    return () => {
      window.removeEventListener("offline-sync-complete", handleSyncComplete);
    };
  }, [refreshProfile]);

  const popStatsKey =
    profileState && !isGuestProfile(profileState)
      ? (profileState.id ?? "__no_id__")
      : null;

  useEffect(() => {
    if (!popStatsKey) return;
    (async () => {
      try {
        setPopStats(await fetchPopulationStats());
      } catch (err) {
        logError("Population stats unavailable, using seed baseline:", err);
      }
    })();
  }, [popStatsKey]);

  const submitBirthYear = async () => {
    const year = parseInt(birthYearInput, 10);
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(year) || year < 1900 || year > thisYear - 13) {
      toast.error(t.birth_year_invalid);
      return;
    }
    setSavingAge(true);
    try {
      setProfile(await saveBirthDate(`${year}-01-01`));
      setBirthYearInput("");
    } catch (err) {
      logError("Save birth year failed:", err);
      toast.error(t.save_failed);
    } finally {
      setSavingAge(false);
    }
  };

  const onLogout = async () => {
    await handleLogout();
    setProfile(null);
    setAdminPanelOpen(false);
    setSelectedGame(null);
    setActivePage("dashboard");
    setOnboardingOpen(false);
    setOnboardingDismissed(false);
  };

  const exitGuestToAuth = async () => {
    await handleLogout();
    setProfile(null);
    setSelectedGame(null);
    setActivePage("dashboard");
    setOnboardingOpen(false);
    setOnboardingDismissed(false);
  };

  const [activity, setActivity] = useState<ActivityStats>({
    xpToday: 0,
    sessionsThisMonth: 0,
  });

  const activityKey =
    profileState?.id && !isGuestProfile(profileState)
      ? `${profileState.id}:${String(profileState.total_xp)}`
      : null;

  useEffect(() => {
    if (!activityKey) {
      setActivity({ xpToday: 0, sessionsThisMonth: 0 });
      return;
    }
    fetchActivityStats()
      .then(setActivity)
      .catch((err) => logError("Activity stats failed:", err));
  }, [activityKey]);

  useEffect(() => {
    if (!profileState?.id) {
      previousRoundsRef.current = null;
      setOnboardingDismissed(false);
      setOnboardingOpen(false);
      return;
    }

    const previous = previousRoundsRef.current;
    if (
      previous !== null &&
      previous < CALIBRATION_TARGET &&
      roundsPlayed >= CALIBRATION_TARGET
    ) {
      setShowCalibrationComplete(true);
    }
    previousRoundsRef.current = roundsPlayed;

    if (roundsPlayed >= CALIBRATION_TARGET || onboardingDismissed) return;
    try {
      if (localStorage.getItem(onboardingStorageKey(profileState.id)) !== "1") {
        setOnboardingOpen(true);
      }
    } catch {
      setOnboardingOpen(true);
    }
  }, [profileState?.id, roundsPlayed, onboardingDismissed]);

  return {
    adminPanelOpen,
    setAdminPanelOpen,
    accessDenied,
    setAccessDenied,
    authChecked,
    profile: profileState,
    setProfile,
    profileRef,
    refreshProfile,
    activePage,
    setActivePage,
    selectedGame,
    setSelectedGame,
    roundResult,
    setRoundResult,
    gamificationKey,
    setGamificationKey,
    popStats,
    birthYearInput,
    setBirthYearInput,
    submitBirthYear,
    savingAge,
    onboardingOpen,
    setOnboardingOpen,
    showCalibrationComplete,
    setShowCalibrationComplete,
    roundsPlayed,
    markOnboardingSeen,
    goToCalibration,
    onLogout,
    exitGuestToAuth,
    activity,
  };
}
