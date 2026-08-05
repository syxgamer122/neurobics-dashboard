import {
  Suspense,
  lazy,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { LangProvider, useLang } from "./lib/i18n";
import { Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";

import { AccessDeniedOverlay } from "./components/app/access-denied-overlay";
import { AmbientBackground } from "./components/app/ambient-background";
import { AppHeader } from "./components/app/app-header";
import { PlayArena } from "./components/app/play-arena";
import { ProfilePage } from "./components/app/profile-page";
import { ErrorBoundary } from "./components/error-boundary";
import { HistoryPanel } from "./components/history-panel";
import {
  CALIBRATION_TARGET,
  CalibrationBanner,
  OnboardingOverlay,
} from "./components/onboarding";
import { AchievementsPanel } from "./components/achievements-panel";
import { QuestsPanel } from "./components/quests-panel";
import { AuthScreen } from "./components/auth-screen";
import { FloatingDock, type DockPage } from "./components/floating-dock";
import {
  BrainAgeCard,
  CognitiveIndexCard,
  LevelCard,
  StreakCard,
} from "./components/dashboard";

import {
  RoundResultOverlay,
  type RoundResult,
} from "./components/ui/round-result-overlay";

import {
  getAccessToken,
  fetchProfile,
  handleLogout,
  saveBirthYear,
  fetchPopulationStats,
  cognitiveIndex,
  fetchActivityStats,
  type ActivityStats,
  type Profile,
  type RoundGame,
} from "./lib/api";
import { useRoundSubmission } from "./hooks/use-round-submission";
import {
  RATING_MAX,
  calcBrainAge,
  DEFAULT_POPULATION,
  type PopulationStats,
} from "./lib/scoring";
import { getLevelProgress, getLevelColor } from "./lib/xp";
import { totalSessions } from "./lib/sessions";
import { type AxisKey } from "./lib/axes";
import { logError } from "./lib/logger";
import { isGuestProfile } from "./lib/guest";

// ─── Chunk tai theo nhu cau ─────────────────────────────────
// admin-panel (~1000 dong, chi admin mo duoc) va radar recharts (~100KB)
// truoc day nam trong bundle dau tien cua MOI nguoi dung. Gio tach rieng.
const AdminPanel = lazy(() =>
  import("./components/admin-panel").then((m) => ({ default: m.AdminPanel })),
);
const CognitiveMatrixCard = lazy(() =>
  import("./components/dashboard/cognitive-matrix-card").then((m) => ({
    default: m.CognitiveMatrixCard,
  })),
);

/** Spinner toan man — dung khi doi chunk admin panel. */
function FullScreenFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neuro-ink">
      <Loader2 size={28} className="animate-spin text-neuro-cyan" />
    </div>
  );
}

/** Khung giu cho radar trong khi recharts dang tai — tranh nhay layout. */
function ChartCardFallback() {
  return (
    <div
      className="lg:col-span-2 rounded-2xl min-h-[320px] flex items-center justify-center"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(0,212,255,0.12)",
      }}
    >
      <Loader2 size={22} className="animate-spin text-neuro-cyan" />
    </div>
  );
}

// ─── Cognitive data ────────────────────────────────────────────────────────────

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ─── Proficiency rating model ───────────────────────────────────────────────────
// All rating maths lives in ./lib/scoring, which is the single source of truth.
// Each of the five axes has its OWN formula fed by its OWN signal, so one fast
// round can no longer lift every axis at once. See that file for the rationale.

// Global Cognitive Index (average of all 5 axes) lives in the API layer as the
// single source of truth — see cognitiveIndex() — so the dashboard and the
// leaderboard can never desync. Round it for display.
const displayIndex = (p: Profile): number => Math.round(cognitiveIndex(p));

/** Total rounds across all games — drives brain-age calibration. */
const totalRounds = (p: Profile) => totalSessions(p);
// Each domain is the stored proficiency rating (0–RATING_MAX) mapped to 0–100
// for the radar. No session division: the rating is already a moving average.
function buildCognitiveData(
  p: Profile,
  labels?: {
    memory: string;
    focus: string;
    logic: string;
    spatial: string;
    speed: string;
  },
) {
  const toPct = (r: number | null | undefined) =>
    clamp100(((r ?? 0) / RATING_MAX) * 100);
  const L = labels ?? {
    memory: "Memory",
    focus: "Focus",
    logic: "Logic",
    spatial: "Spatial",
    speed: "Speed",
  };
  return [
    { subject: L.memory, value: toPct(p.memory_score) },
    { subject: L.focus, value: toPct(p.focus_score) },
    { subject: L.logic, value: toPct(p.algebraic_logic_score) },
    { subject: L.spatial, value: toPct(p.cfop_spatial_record) },
    { subject: L.speed, value: toPct(p.speed_score) },
  ];
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <LangProvider>
      <AppInner />
      <Toaster position="top-center" richColors theme="dark" />
    </LangProvider>
  );
}

function AppInner() {
  const { lang, toggle, t } = useLang();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Snapshot for overlay prev-values — avoids stale closure after setProfile.
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const [activePage, setActivePage] = useState<DockPage>("dashboard");
  const [selectedGame, setSelectedGame] = useState<RoundGame | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  // Tang len sau moi van de panel nhiem vu / thanh tuu tu tinh lai tien do.
  const [gamificationKey, setGamificationKey] = useState(0);
  // Real distribution of Cognitive Index across users — the baseline the brain
  // age is ranked against. Seeded until enough calibrated players exist.
  const [popStats, setPopStats] = useState<PopulationStats>(DEFAULT_POPULATION);
  const [birthYearInput, setBirthYearInput] = useState("");
  const [savingAge, setSavingAge] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [showCalibrationComplete, setShowCalibrationComplete] = useState(false);
  const previousRoundsRef = useRef<number | null>(null);
  // Hooks/effects chay truoc nhanh `if (!profile)`, nen thu hep null tai day.
  // Tai khoan chua nap ho so co 0 van; khong dung `profile!` de che loi that.
  const roundsPlayed = profile ? totalRounds(profile) : 0;

  const onboardingStorageKey = (profileId: string) =>
    `nb_onboarding_seen_${profileId}`;

  const markOnboardingSeen = useCallback(() => {
    if (profile?.id) {
      try {
        localStorage.setItem(onboardingStorageKey(profile.id), "1");
      } catch {
        // Private mode/storage bi chan: dong modal van phai hoat dong.
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

  // Load the population baseline once a session is active. Failure is silent:
  // the seed distribution keeps the dial rendering. Khach: bo qua (khong co token).
  useEffect(() => {
    if (!profile || isGuestProfile(profile)) return;
    (async () => {
      try {
        setPopStats(await fetchPopulationStats());
      } catch (err) {
        logError("Population stats unavailable, using seed baseline:", err);
      }
    })();
  }, [profile?.id]);

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

  const axisLabels = useCallback(
    (): Record<AxisKey, string> => ({
      memory: t.axis_memory,
      focus: t.axis_focus,
      logic: t.axis_logic,
      spatial: t.axis_spatial,
      speed: t.axis_speed,
    }),
    [t.axis_memory, t.axis_focus, t.axis_logic, t.axis_spatial, t.axis_speed],
  );

  const { beginPlay, makeGameHandler } = useRoundSubmission({
    selectedGame,
    profileRef,
    setProfile,
    setRoundResult,
    setGamificationKey,
    axisLabels,
    saveFailedLabel: t.save_failed,
    retrySendLabel: t.retry_send,
  });

  const onLogout = async () => {
    // Khach khong co session Supabase — chi xoa ho so ao.
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

  useEffect(() => {
    if (!profile?.id || isGuestProfile(profile)) {
      setActivity({ xpToday: 0, sessionsThisMonth: 0 });
      return;
    }

    fetchActivityStats()
      .then(setActivity)
      .catch((err) => logError("Activity stats failed:", err));
  }, [profile?.id, profile?.total_xp]);

  // Ho so la nguon su that: localStorage chi nho da xem huong dan, khong quyet
  // dinh trang thai hieu chuan. Tai khoan duoi 5 van luon thay thanh tien do.
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
      // Khong doc duoc storage: hien onboarding, nguoi dung van co the dong.
      setOnboardingOpen(true);
    }
  }, [profile?.id, roundsPlayed, onboardingDismissed]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neuro-ink">
        <Loader2 size={28} className="animate-spin text-neuro-cyan" />
      </div>
    );
  }

  if (!profile) {
    return (
      <AuthScreen
        onAuthed={async (p) => (p ? setProfile(p) : refreshProfile())}
      />
    );
  }

  const isGuest = isGuestProfile(profile);
  const isAdmin = !isGuest && profile.role === "admin";

  const cognitiveData = buildCognitiveData(profile, {
    memory: t.axis_memory,
    focus: t.axis_focus,
    logic: t.axis_logic,
    spatial: t.axis_spatial,
    speed: t.axis_speed,
  });
  const levelProgress = getLevelProgress(profile.total_xp ?? 0);
  const levelColor = getLevelColor(levelProgress.level);
  const brainAge = calcBrainAge(
    {
      cognitiveIndex: cognitiveIndex(profile),
      birthYear: profile.birth_year,
      roundsPlayed: totalRounds(profile),
    },
    popStats,
  );

  if (adminPanelOpen)
    return (
      <ErrorBoundary area="admin-panel">
        <Suspense fallback={<FullScreenFallback />}>
          <AdminPanel
            onExit={() => setAdminPanelOpen(false)}
            profile={profile}
            onProfileChange={setProfile}
            onAccountDeleted={() => {
              setAdminPanelOpen(false);
              setProfile(null);
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );

  return (
    <div
      className="min-h-screen text-slate-100 overflow-x-hidden"
      style={{ fontFamily: "'Exo 2', sans-serif", background: "#050A18" }}
    >
      <style>{`
        @keyframes streakGlow {
          0%, 100% { box-shadow: 0 0 24px rgba(245,158,11,0.35); }
          50% { box-shadow: 0 0 50px rgba(245,158,11,0.65), 0 0 100px rgba(245,158,11,0.18); }
        }
        .streak-glow { animation: streakGlow 1.8s ease-in-out infinite; }
      `}</style>
      <AmbientBackground />

      <AppHeader
        profile={profile}
        lang={lang}
        t={t}
        onToggleLanguage={toggle}
        onLogout={onLogout}
      />

      {/* Main — pb du de khong bi dock + home indicator che */}
      <main
        className="relative z-10 max-w-[1380px] mx-auto px-3 sm:px-5 py-5 sm:py-7 space-y-5 sm:space-y-6"
        style={{
          // Du cho floating dock (~72px) + khoang thoang nut day game (NEW GAME...).
          paddingBottom:
            "max(10rem, calc(7.5rem + env(safe-area-inset-bottom)))",
        }}
      >
        {isGuest && (
          <div
            className="flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.28)",
            }}
          >
            <p className="text-sm leading-relaxed text-emerald-100/90">
              {t.guest_banner}
            </p>
            <button
              type="button"
              onClick={exitGuestToAuth}
              className="h-10 shrink-0 rounded-xl px-4 text-xs font-bold tracking-wider transition-all hover:brightness-125"
              style={{
                background: "rgba(16,185,129,0.18)",
                color: "#34D399",
                border: "1px solid rgba(16,185,129,0.4)",
              }}
            >
              {t.guest_register}
            </button>
          </div>
        )}

        {activePage === "dashboard" && (
          <>
            {(roundsPlayed < CALIBRATION_TARGET || showCalibrationComplete) && (
              <CalibrationBanner
                played={roundsPlayed}
                completed={roundsPlayed >= CALIBRATION_TARGET}
                onStart={goToCalibration}
                onDismiss={() => setShowCalibrationComplete(false)}
              />
            )}

            {/* ROW 1: Scores + Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="flex flex-col gap-5">
                <CognitiveIndexCard index={displayIndex(profile)} />

                <BrainAgeCard
                  brainAge={brainAge}
                  birthYearInput={birthYearInput}
                  onBirthYearChange={(v) =>
                    setBirthYearInput(v.replace(/\D/g, "").slice(0, 4))
                  }
                  onSubmit={submitBirthYear}
                  saving={savingAge}
                />
              </div>

              <ErrorBoundary area="dashboard:cognitive-matrix" variant="inline">
                <Suspense fallback={<ChartCardFallback />}>
                  <CognitiveMatrixCard
                    data={cognitiveData}
                    rounds={totalRounds(profile)}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          </>
        )}

        {activePage === "play" && (
          <PlayArena
            selectedGame={selectedGame}
            t={t}
            onSelect={setSelectedGame}
            beginPlay={beginPlay}
            makeGameHandler={makeGameHandler}
          />
        )}

        {activePage === "dashboard" && (
          <>
            {/* ROW 2.5: Level / XP */}
            <div className="grid grid-cols-1 gap-5">
              <LevelCard
                levelProgress={levelProgress}
                levelColor={levelColor}
                totalXp={profile.total_xp ?? 0}
              />
            </div>

            {/* ROW 3: Streak */}
            <div className="grid grid-cols-1 gap-5">
              <StreakCard
                streak={profile.synapse_streak}
                sessionsThisMonth={activity.sessionsThisMonth}
                xpToday={activity.xpToday}
              />
            </div>

            {!isGuest && (
              <QuestsPanel
                refreshKey={gamificationKey}
                onClaimed={() => {
                  // XP thuong duoc cong o server, keo ho so moi ve de hien dung.
                  void fetchProfile()
                    .then((fresh) => {
                      if (fresh) setProfile(fresh);
                    })
                    // Than ham rong -> tra ve void. Neu viet `() => undefined`
                    // thi tsc phai tu suy kieu tra ve va bao TS7011.
                    .catch(() => {});
                }}
              />
            )}

            {!isGuest && <AchievementsPanel refreshKey={gamificationKey} />}
          </>
        )}

        {activePage === "history" &&
          (isGuest ? (
            <div
              className="rounded-2xl p-6 text-sm text-slate-300"
              style={{
                background: "rgba(13,20,45,0.62)",
                border: "1px solid rgba(0,212,255,0.14)",
              }}
            >
              {t.guest_locked}
              <button
                type="button"
                onClick={exitGuestToAuth}
                className="mt-4 block h-10 rounded-xl px-4 text-xs font-bold tracking-wider"
                style={{
                  background: "rgba(0,212,255,0.12)",
                  color: "#00D4FF",
                  border: "1px solid rgba(0,212,255,0.3)",
                }}
              >
                {t.guest_register}
              </button>
            </div>
          ) : (
            <HistoryPanel />
          ))}
        {activePage === "profile" && (
          <ProfilePage
            profile={profile}
            t={t}
            cognitiveIndex={displayIndex(profile)}
            isGuest={isGuest}
            isAdmin={isAdmin}
            onProfileChange={setProfile}
            onDeleted={() => {
              setProfile(null);
              setAdminPanelOpen(false);
              setActivePage("dashboard");
            }}
            onRegister={exitGuestToAuth}
            onOpenOnboarding={() => setOnboardingOpen(true)}
            onLogout={onLogout}
          />
        )}
      </main>

      {roundResult && (
        <RoundResultOverlay
          result={roundResult}
          onClose={() => setRoundResult(null)}
        />
      )}

      {onboardingOpen && (
        <OnboardingOverlay
          username={profile.username}
          played={roundsPlayed}
          onClose={markOnboardingSeen}
          onStart={goToCalibration}
        />
      )}

      {/* An dock khi overlay ket qua / onboarding mo — tranh che nut CONTINUEva CTA. */}
      {!roundResult && !onboardingOpen && (
        <FloatingDock
          active={activePage}
          onSelect={(page) => {
            if (page === "god") {
              if (isAdmin) setAdminPanelOpen(true);
              else setAccessDenied(true);
            } else {
              if (page !== "play") setSelectedGame(null);
              setActivePage(page);
            }
          }}
        />
      )}

      {accessDenied && (
        <AccessDeniedOverlay
          profile={profile}
          t={t}
          onClose={() => setAccessDenied(false)}
        />
      )}
    </div>
  );
}
