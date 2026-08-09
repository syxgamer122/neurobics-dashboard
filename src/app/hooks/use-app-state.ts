import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  getAccessToken,
  fetchProfile,
  handleLogout,
  saveBirthYear,
  fetchPopulationStats,
  fetchActivityStats,
  type Profile,
  type ActivityStats,
  type RoundGame,
} from "../lib/api";
import { DEFAULT_POPULATION, type PopulationStats } from "../lib/scoring";
import { totalSessions } from "../lib/sessions";
import { isGuestProfile } from "../lib/guest";
import { logError } from "../lib/logger";
import { CALIBRATION_TARGET } from "../components/onboarding";
import { type Translation } from "../lib/i18n";
import type { DockPage } from "../components/floating-dock";
import type { RoundResult } from "../components/ui/round-result-overlay";

export function useAppState(t: Translation) {
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

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

  const roundsPlayed = profile ? totalSessions(profile) : 0;

  const onboardingStorageKey = (profileId: string) =>
    `nb_onboarding_seen_${profileId}`;

  const markOnboardingSeen = useCallback(() => {
    if (profile?.id) {
      try {
        localStorage.setItem(onboardingStorageKey(profile.id), "1");
      } catch {
        // Thu muc luu the co the bi khoa o private mode.
      }
    }
    setOnboardingDismissed(true);
    setOnboardingOpen(false);
  }, [profile?.id]);

  const goToCalibration = useCallback(() => {
    markOnboardingSeen();
    setSelectedGame(null);
    setActivePage("play");
  }, [markOnboardingSeen]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          const p = await fetchProfile();
          setProfile(p);
        }
      } catch (err) {
        logError("Session restore error:", err);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const refreshProfile = async () => {
    try {
      setProfile(await fetchProfile());
    } catch (err) {
      logError("Refresh profile error:", err);
    }
  };

  const popStatsKey =
    profile && !isGuestProfile(profile) ? (profile.id ?? "__no_id__") : null;

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
    if (!Number.isFinite(year) || year < 1900 || year > thisYear) {
      toast.error(t.birth_year_invalid);
      return;
    }
    setSavingAge(true);
    try {
      setProfile(await saveBirthYear(year));
      setBirthYearInput("");
    } catch (err) {
      logError("Save birth year failed:", err);
      toast.error(t.save_failed);
    } finally {
      setSavingAge(false);
    }
  };

  const onLogout = async () => {
    if (!isGuestProfile(profile)) {
      await handleLogout();
    }
    setProfile(null);
    setAdminPanelOpen(false);
    setSelectedGame(null);
    setActivePage("dashboard");
    setOnboardingOpen(false);
    setOnboardingDismissed(false);
  };

  const exitGuestToAuth = () => {
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
    profile?.id && !isGuestProfile(profile)
      ? `${profile.id}:${String(profile.total_xp)}`
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
    if (!profile?.id) {
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
      if (localStorage.getItem(onboardingStorageKey(profile.id)) !== "1") {
        setOnboardingOpen(true);
      }
    } catch {
      setOnboardingOpen(true);
    }
  }, [profile?.id, roundsPlayed, onboardingDismissed]);

  return {
    adminPanelOpen,
    setAdminPanelOpen,
    accessDenied,
    setAccessDenied,
    authChecked,
    profile,
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
