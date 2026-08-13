import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "./components/error-boundary";
import { PlayArena } from "./components/app/play-arena";
import { ProfilePage } from "./components/app/profile-page";
import { HistoryPanel } from "./components/history-panel";
import { CALIBRATION_TARGET, CalibrationBanner } from "./components/onboarding";
import { AchievementsPanel } from "./components/achievements-panel";
import { QuestsPanel } from "./components/quests-panel";
import { CognitiveIndexCard, LevelCard } from "./components/dashboard";
import {
  cognitiveIndex,
  type Profile,
  type GameId,
  type RoundGame,
} from "./lib/api";
import { RATING_MAX } from "./lib/scoring";
import { getLevelProgress, getLevelColor } from "./lib/xp";
import { totalSessions } from "./lib/sessions";
import { type DockPage } from "./components/floating-dock";
import { type Translation } from "./lib/i18n";

const CognitiveMatrixCard = lazy(() =>
  import("./components/dashboard/cognitive-matrix-card").then((m) => ({
    default: m.CognitiveMatrixCard,
  })),
);

function ChartCardFallback() {
  return (
    <div
      className="lg:col-span-2 rounded-2xl min-h-[320px] flex items-center justify-center"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(var(--neuro-cyan-rgb),0.12)",
      }}
    >
      <Loader2 size={22} className="animate-spin text-neuro-cyan" />
    </div>
  );
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const displayIndex = (p: Profile): number => Math.round(cognitiveIndex(p));

const totalRounds = (p: Profile) => totalSessions(p);

function buildCognitiveData(
  p: Profile,
  labels: {
    memory: string;
    focus: string;
    logic: string;
    spatial: string;
    speed: string;
  },
) {
  const toPct = (r: number | null | undefined) =>
    clamp100(((r ?? 0) / RATING_MAX) * 100);
  return [
    { subject: labels.memory, value: toPct(p.memory_score) },
    { subject: labels.focus, value: toPct(p.focus_score) },
    { subject: labels.logic, value: toPct(p.algebraic_logic_score) },
    { subject: labels.spatial, value: toPct(p.spatial_score) },
    { subject: labels.speed, value: toPct(p.speed_score) },
  ];
}

interface AppRouterProps {
  activePage: DockPage;
  profile: Profile;
  t: Translation;
  isGuest: boolean;
  isAdmin: boolean;
  roundsPlayed: number;
  showCalibrationComplete: boolean;
  setShowCalibrationComplete: (v: boolean) => void;
  goToCalibration: () => void;
  selectedGame: GameId | null;
  setSelectedGame: (g: GameId | null) => void;
  beginPlay: (game: RoundGame) => void;
  makeGameHandler: (game: RoundGame) => (telemetry: unknown) => Promise<void>;
  gamificationKey: number;
  setProfile: (p: Profile | null) => void;
  refreshProfile: () => void;
  exitGuestToAuth: () => void;
  setAdminPanelOpen: (v: boolean) => void;
  setActivePage: (p: DockPage) => void;
  setOnboardingOpen: (v: boolean) => void;
  onLogout: () => void;
}

export function AppRouter({
  activePage,
  profile,
  t,
  isGuest,
  isAdmin,
  roundsPlayed,
  showCalibrationComplete,
  setShowCalibrationComplete,
  goToCalibration,
  selectedGame,
  setSelectedGame,
  beginPlay,
  makeGameHandler,
  gamificationKey,
  setProfile,
  refreshProfile,
  exitGuestToAuth,
  setAdminPanelOpen,
  setActivePage,
  setOnboardingOpen,
  onLogout,
}: AppRouterProps) {
  const cognitiveData = buildCognitiveData(profile, {
    memory: t.axis_memory,
    focus: t.axis_focus,
    logic: t.axis_logic,
    spatial: t.axis_spatial,
    speed: t.axis_speed,
  });
  const levelProgress = getLevelProgress(profile.total_xp ?? 0);
  const levelColor = getLevelColor(levelProgress.level);

  return (
    <main
      className="relative z-10 max-w-[1380px] mx-auto px-3 sm:px-5 py-5 sm:py-7 space-y-5 sm:space-y-6"
      style={{
        paddingBottom: "max(10rem, calc(7.5rem + env(safe-area-inset-bottom)))",
      }}
    >
      <div className="page-enter">
        {isGuest && (
          <div
            className="flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            style={{
              background: "rgba(var(--neuro-green-rgb),0.1)",
              border: "1px solid rgba(var(--neuro-green-rgb),0.28)",
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
                background: "rgba(var(--neuro-green-rgb),0.18)",
                color: "#34D399",
                border: "1px solid rgba(var(--neuro-green-rgb),0.4)",
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="flex flex-col gap-5">
                <CognitiveIndexCard index={displayIndex(profile)} />
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

            <div className="grid grid-cols-1 gap-5 mt-5">
              <LevelCard
                levelProgress={levelProgress}
                levelColor={levelColor}
                totalXp={profile.total_xp ?? 0}
              />
            </div>

            {!isGuest && (
              <div className="mt-5 space-y-5">
                <QuestsPanel
                  refreshKey={gamificationKey}
                  onClaimed={() => {
                    void refreshProfile();
                  }}
                />
                <AchievementsPanel refreshKey={gamificationKey} />
              </div>
            )}
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

        {activePage === "history" &&
          (isGuest ? (
            <div
              className="rounded-2xl p-6 text-sm text-slate-300"
              style={{
                background: "rgba(var(--neuro-panel-rgb),0.62)",
                border: "1px solid rgba(var(--neuro-cyan-rgb),0.14)",
              }}
            >
              {t.guest_locked}
              <button
                type="button"
                onClick={exitGuestToAuth}
                className="mt-4 block h-10 rounded-xl px-4 text-xs font-bold tracking-wider"
                style={{
                  background: "rgba(var(--neuro-cyan-rgb),0.12)",
                  color: "#00D4FF",
                  border: "1px solid rgba(var(--neuro-cyan-rgb),0.3)",
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
      </div>
    </main>
  );
}
