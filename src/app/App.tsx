import { Suspense, lazy, useCallback } from "react";
import { useLang } from "./lib/i18n";
import { LangProvider } from "./lib/lang-provider";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";

import { AccessDeniedOverlay } from "./components/app/access-denied-overlay";
import { AmbientBackground } from "./components/app/ambient-background";
import { AppHeader } from "./components/app/app-header";
import { ErrorBoundary } from "./components/error-boundary";
import { AuthScreen } from "./components/auth-screen";
import { FloatingDock } from "./components/floating-dock";

import { RoundResultOverlay } from "./components/ui/round-result-overlay";

import { useAppState } from "./hooks/use-app-state";
import { useRoundSubmission } from "./hooks/use-round-submission";
import { useOfflineSync } from "./hooks/use-offline-sync";
import { type AxisKey } from "./lib/axes";
import { isGuestProfile } from "./lib/api";
import { AppRouter } from "./AppRouter";
import { OnboardingOverlay } from "./components/onboarding";
// ─── Chunk tai theo nhu cau ─────────────────────────────────
// admin-panel (~1000 dong, chi admin mo duoc) va radar recharts (~100KB)
// truoc day nam trong bundle dau tien cua MOI nguoi dung. Gio tach rieng.
const AdminPanel = lazy(() =>
  import("./components/admin-panel").then((m) => ({ default: m.AdminPanel })),
);

/** Spinner toan man — dung khi doi chunk admin panel. */
function FullScreenFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neuro-ink">
      <Loader2 size={28} className="animate-spin text-neuro-cyan" />
    </div>
  );
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

  const {
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
    onboardingOpen,
    setOnboardingOpen,
    showCalibrationComplete,
    setShowCalibrationComplete,
    roundsPlayed,
    markOnboardingSeen,
    goToCalibration,
    onLogout,
    exitGuestToAuth,
  } = useAppState(t);

  // Kích hoạt đồng bộ offline ngầm
  useOfflineSync();

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
        onAuthed={(p) => {
          if (p) setProfile(p);
          else void refreshProfile();
        }}
      />
    );
  }

  const isGuest = isGuestProfile(profile);
  const isAdmin = !isGuest && profile.role === "admin";

  if (adminPanelOpen && isAdmin)
    return (
      <ErrorBoundary area="admin-panel">
        <Suspense fallback={<FullScreenFallback />}>
          <AdminPanel
            onExit={() => setAdminPanelOpen(false)}
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
      className="min-h-screen bg-background text-foreground overflow-x-hidden"
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      <AmbientBackground />

      <AppHeader
        profile={profile}
        lang={lang}
        t={t}
        onToggleLanguage={toggle}
        onLogout={onLogout}
      />

      <AppRouter
        activePage={activePage}
        profile={profile}
        t={t}
        isGuest={isGuest}
        isAdmin={isAdmin}
        roundsPlayed={roundsPlayed}
        showCalibrationComplete={showCalibrationComplete}
        setShowCalibrationComplete={setShowCalibrationComplete}
        goToCalibration={goToCalibration}
        selectedGame={selectedGame}
        setSelectedGame={setSelectedGame}
        beginPlay={beginPlay}
        makeGameHandler={makeGameHandler}
        gamificationKey={gamificationKey}
        setProfile={setProfile}
        refreshProfile={refreshProfile}
        exitGuestToAuth={exitGuestToAuth}
        setAdminPanelOpen={setAdminPanelOpen}
        setActivePage={setActivePage}
        setOnboardingOpen={setOnboardingOpen}
        onLogout={onLogout}
      />

      {roundResult && (
        <RoundResultOverlay
          result={roundResult}
          onClose={() => setRoundResult(null)}
        />
      )}

      {onboardingOpen && !roundResult && (
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

      {accessDenied && !roundResult && !onboardingOpen && (
        <AccessDeniedOverlay
          profile={profile}
          t={t}
          onClose={() => setAccessDenied(false)}
        />
      )}
    </div>
  );
}
