import { useState, useEffect, useCallback, useRef } from "react";
import { LangProvider, useLang } from "./lib/i18n";
import {
  Brain,
  ChevronRight,
  Zap,
  Activity,
  Terminal,
  Grid3X3,
  Focus,
  Sparkles,
  Calculator,
  LogOut,
  Loader2,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { AdminPanel } from "./components/admin-panel";
import { HistoryPanel } from "./components/history-panel";
import { SettingsPanel } from "./components/settings-panel";
import { NBackGame } from "./games/nback-game";
import { MathSprintGame } from "./games/math-game";
import { AchievementsPanel } from "./components/achievements-panel";
import { QuestsPanel } from "./components/quests-panel";
import { FriendsPanel } from "./components/friends-panel";
import { AuthScreen } from "./components/auth-screen";
import { FloatingDock, type DockPage } from "./components/floating-dock";
import {
  BrainAgeCard,
  CognitiveIndexCard,
  CognitiveMatrixCard,
  LevelCard,
  StreakCard,
} from "./components/dashboard";

import { SchulteTableGame } from "./games/schulte-game";
import { SudokuGame } from "./games/sudoku-game";
import { StroopGame } from "./games/stroop-game";
import { MemoryMatrixGame } from "./games/memory-game";
import { ReactionTimeGame } from "./games/reaction-game";

import { GlassCard } from "./components/ui/glass-card";
import { GameTile } from "./components/ui/game-tile";
import { StatMini } from "./components/ui/stat-mini";
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
import { APP_VERSION_LABEL } from "./lib/version";
import { logError } from "./lib/logger";

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
  const [selectedGame, setSelectedGame] = useState<
    | "schulte"
    | "sudoku"
    | "stroop"
    | "memory"
    | "reaction"
    | "nback"
    | "math"
    | null
  >(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  // Tang len sau moi van de panel nhiem vu / thanh tuu tu tinh lai tien do.
  const [gamificationKey, setGamificationKey] = useState(0);
  // Real distribution of Cognitive Index across users — the baseline the brain
  // age is ranked against. Seeded until enough calibrated players exist.
  const [popStats, setPopStats] = useState<PopulationStats>(DEFAULT_POPULATION);
  const [birthYearInput, setBirthYearInput] = useState("");
  const [savingAge, setSavingAge] = useState(false);

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
  // the seed distribution keeps the dial rendering.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        setPopStats(await fetchPopulationStats());
      } catch (err) {
        logError(
          "Population stats unavailable, using seed baseline:",
          err,
        );
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
    await handleLogout();
    setProfile(null);
    setAdminPanelOpen(false);
  };

  const [activity, setActivity] = useState<ActivityStats>({
    xpToday: 0,
    sessionsThisMonth: 0,
  });

  useEffect(() => {
    if (!profile?.id) return;

    fetchActivityStats()
      .then(setActivity)
      .catch((err) => logError("Activity stats failed:", err));
  }, [profile?.id, profile?.total_xp]);

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

  const isAdmin = profile.role === "admin";

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
      <AdminPanel
        onExit={() => setAdminPanelOpen(false)}
        profile={profile}
        onProfileChange={setProfile}
        onAccountDeleted={() => {
          setAdminPanelOpen(false);
          setProfile(null);
        }}
      />
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
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            top: "-15%",
            left: "-8%",
            width: 700,
            height: 700,
            background:
              "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            top: "25%",
            right: "-12%",
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: "-10%",
            left: "35%",
            width: 500,
            height: 500,
            background:
              "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      {/* Nav */}
      <nav
        className="relative z-10 flex items-center justify-between px-8 py-4"
        style={{ borderBottom: "1px solid rgba(0,212,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #00D4FF, #7C3AED)",
              boxShadow: "0 0 20px rgba(0,212,255,0.4)",
            }}
          >
            <Brain size={17} className="text-white" />
          </div>
          <span className="text-lg font-bold tracking-[0.22em] text-white font-mono">
            NEUROBICS
          </span>
          <span
            className="text-xs rounded px-2 py-0.5 tracking-widest ml-1 font-mono"
            style={{
              background: "rgba(0,212,255,0.08)",
              color: "#00D4FF",
              border: "1px solid rgba(0,212,255,0.18)",
            }}
          >
            {APP_VERSION_LABEL}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Activity size={12} className="text-neuro-cyan" />
            <span>{t.league}</span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{
              background: "rgba(13,20,45,0.6)",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
          >
            <div
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold uppercase font-mono"
              style={{
                background: profile.avatar_url
                  ? "#0B1228"
                  : "linear-gradient(135deg, #A855F7, #7C3AED)",
              }}
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.username.slice(0, 2)
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                {profile.username}
              </div>
              <div className="text-xs text-slate-500">
                {profile.synapse_streak} {t.day_streak}
              </div>
            </div>
          </div>
          <button
            onClick={toggle}
            title="Switch language"
            className="h-9 px-3 rounded-xl flex items-center justify-center text-xs font-bold tracking-wider transition-all duration-150 hover:brightness-125"
            style={{
              background: "rgba(13,20,45,0.6)",
              border: "1px solid rgba(0,212,255,0.15)",
              color: "#00D4FF",
            }}
          >
            {lang === "vi" ? "EN" : "VI"}
          </button>
          <button
            onClick={onLogout}
            title="Sign out"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
            style={{
              background: "rgba(13,20,45,0.6)",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 max-w-[1380px] mx-auto px-5 py-7 pb-32 space-y-6">
        {activePage === "dashboard" && (
          <>
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

              <CognitiveMatrixCard
                data={cognitiveData}
                rounds={totalRounds(profile)}
              />
            </div>
          </>
        )}

        {activePage === "play" && (
          <>
            {/* Section divider */}
            <div className="flex items-center gap-4 pt-1">
              <Zap
                size={14}
                className="text-neuro-cyan shrink-0"
                style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }}
              />
              <span className="text-xs text-white tracking-[0.25em] uppercase font-mono">
                {t.arena}
              </span>
              <div
                className="flex-1 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0,212,255,0.3), transparent)",
                }}
              />
              {selectedGame ? (
                <button
                  onClick={() => setSelectedGame(null)}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{
                    color: "#00D4FF",
                  }}
                >
                  <ChevronRight size={12} className="rotate-180" />{" "}
                  {t.back_to_arena}
                </button>
              ) : null}
            </div>

            {/* Game hub: pick a game */}
            {!selectedGame && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl">
                <GameTile
                  accent="#A855F7"
                  icon={<Focus size={22} />}
                  tag={t.focus_training}
                  title="Schulte Table"
                  desc={t.schulte_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("schulte")}
                />
                <GameTile
                  accent="#00D4FF"
                  icon={<Grid3X3 size={22} />}
                  tag={t.logic_training}
                  title="Sudoku"
                  desc={t.sudoku_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("sudoku")}
                />
                <GameTile
                  accent="#EAB308"
                  icon={<Zap size={22} />}
                  tag={t.stroop_tag}
                  title="Stroop Test"
                  desc={t.stroop_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("stroop")}
                />
                <GameTile
                  accent="#10B981"
                  icon={<Activity size={22} />}
                  tag={t.rx_tag}
                  title="Reaction Time"
                  desc={t.rx_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("reaction")}
                />
                <GameTile
                  accent="#F43F5E"
                  icon={<Brain size={22} />}
                  tag={t.mem_tag}
                  title="Memory Matrix"
                  desc={t.mem_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("memory")}
                />
                <GameTile
                  accent="#A855F7"
                  icon={<Sparkles size={22} />}
                  tag={t.nback_tag}
                  title="N-Back"
                  desc={t.nback_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("nback")}
                />
                <GameTile
                  accent="#38BDF8"
                  icon={<Calculator size={22} />}
                  tag={t.math_tag}
                  title="Math Sprint"
                  desc={t.math_desc}
                  playLabel={t.play_now}
                  onPlay={() => setSelectedGame("math")}
                />
              </div>
            )}

            {selectedGame === "schulte" && (
              <div className="max-w-lg">
                <SchulteTableGame
                  onComplete={makeGameHandler("schulte")}
                  onPlayStart={() => beginPlay("schulte")}
                />
              </div>
            )}

            {selectedGame === "sudoku" && (
              <div className="max-w-md">
                <SudokuGame
                  onComplete={makeGameHandler("sudoku")}
                  onPlayStart={() => beginPlay("sudoku")}
                />
              </div>
            )}

            {selectedGame === "stroop" && (
              <div className="max-w-sm">
                <StroopGame
                  onComplete={makeGameHandler("stroop")}
                  onPlayStart={() => beginPlay("stroop")}
                />
              </div>
            )}
            {selectedGame === "reaction" && (
              <div className="max-w-sm">
                <ReactionTimeGame
                  onComplete={makeGameHandler("reaction")}
                  onPlayStart={() => beginPlay("reaction")}
                />
              </div>
            )}
            {selectedGame === "memory" && (
              <div className="max-w-sm">
                <MemoryMatrixGame
                  onComplete={makeGameHandler("memory")}
                  onPlayStart={() => beginPlay("memory")}
                />
              </div>
            )}
            {selectedGame === "nback" && (
              <div className="max-w-sm">
                <NBackGame
                  onComplete={makeGameHandler("nback")}
                  onPlayStart={() => beginPlay("nback")}
                />
              </div>
            )}
            {selectedGame === "math" && (
              <div className="max-w-sm">
                <MathSprintGame
                  onComplete={makeGameHandler("math")}
                  onPlayStart={() => beginPlay("math")}
                />
              </div>
            )}
          </>
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

            <QuestsPanel
              refreshKey={gamificationKey}
              onClaimed={() => {
                // XP thuong duoc cong o server, keo ho so moi ve de hien dung.
                void fetchProfile()
                  .then((fresh) => {
                    if (fresh) setProfile(fresh);
                  })
                  .catch(() => undefined);
              }}
            />

            <AchievementsPanel refreshKey={gamificationKey} />
          </>
        )}

        {activePage === "history" && <HistoryPanel />}
        {activePage === "profile" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <GlassCard accent="#00D4FF" className="p-5">
                <StatMini
                  label={t.cognitive_index}
                  value={String(displayIndex(profile))}
                  unit={t.pts}
                  color="#00D4FF"
                />
              </GlassCard>
              <GlassCard accent="#F59E0B" className="p-5">
                <StatMini
                  label={t.synapse_streak}
                  value={String(profile.synapse_streak)}
                  unit={t.days}
                  color="#F59E0B"
                />
              </GlassCard>
              <GlassCard accent="#A855F7" className="p-5">
                <StatMini
                  label={t.clearance}
                  value={isAdmin ? "Ω-1" : "STD"}
                  unit={isAdmin ? "admin" : "user"}
                  color="#A855F7"
                />
              </GlassCard>
            </div>

            <FriendsPanel />

            <SettingsPanel
              profile={profile}
              isAdmin={isAdmin}
              onProfileChange={setProfile}
              onDeleted={() => {
                setProfile(null);
                setAdminPanelOpen(false);
                setActivePage("dashboard");
              }}
            />

            <div className="flex justify-end">
              <button
                onClick={onLogout}
                className="py-2.5 px-5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200"
                style={{
                  background: "rgba(244,63,94,0.1)",
                  color: "#F43F5E",
                  border: "1px solid rgba(244,63,94,0.28)",
                }}
              >
                <LogOut size={13} /> {t.sign_out}
              </button>
            </div>
          </div>
        )}
      </main>

      {roundResult && (
        <RoundResultOverlay
          result={roundResult}
          onClose={() => setRoundResult(null)}
        />
      )}

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

      {/* ── ACCESS DENIED overlay ── */}
      {accessDenied && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: "rgba(5,10,24,0.92)",
            backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.3333))",
          }}
          onClick={() => setAccessDenied(false)}
        >
          {/* Red radial pulse */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(239,68,68,0.18) 0%, transparent 65%)",
            }}
          />

          <div
            className="relative flex flex-col items-center gap-5 p-10 rounded-2xl max-w-sm w-full mx-4"
            style={{
              background: "rgba(13,5,10,0.9)",
              border: "1px solid rgba(239,68,68,0.5)",
              boxShadow:
                "0 0 80px rgba(239,68,68,0.25), inset 0 0 40px rgba(239,68,68,0.04)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scan line animation */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              <div
                className="absolute w-full h-px opacity-20"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #EF4444, transparent)",
                  animation: "scanline 2s linear infinite",
                  top: 0,
                }}
              />
            </div>

            {/* Icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "2px solid rgba(239,68,68,0.5)",
                boxShadow: "0 0 30px rgba(239,68,68,0.3)",
              }}
            >
              <Terminal
                size={28}
                style={{
                  color: "#EF4444",
                  filter: "drop-shadow(0 0 8px rgba(239,68,68,0.8))",
                }}
              />
            </div>

            {/* Text */}
            <div className="text-center space-y-2">
              <div
                className="text-2xl font-bold tracking-[0.3em] font-mono"
                style={{
                  color: "#EF4444",
                  textShadow: "0 0 20px rgba(239,68,68,0.6)",
                }}
              >
                {t.access_denied_title}
              </div>
              <div className="text-xs tracking-widest text-red-400 font-mono">
                {t.auth_level_msg}
              </div>
            </div>

            {/* Log lines — never reveal the admin username here */}
            <div
              className="w-full rounded-lg p-4 space-y-1.5 text-left"
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(239,68,68,0.12)",
              }}
            >
              {[
                {
                  label: "USER",
                  value: profile?.username ?? "—",
                  color: "#94a3b8",
                },
                {
                  label: t.required_label,
                  value: t.access_denied_role,
                  color: "#EF4444",
                },
                { label: "CLEARANCE", value: "OMEGA-1", color: "#EF4444" },
                {
                  label: t.status_label,
                  value: t.unauthorized_label,
                  color: "#EF4444",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className="text-xs w-20 shrink-0"
                    style={{ color: "rgba(239,68,68,0.5)" }}
                  >
                    {label}
                  </span>
                  <span className="text-xs" style={{ color }}>
                    {">"} {value}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setAccessDenied(false)}
              className="w-full py-2 rounded-xl text-xs tracking-widest font-bold transition-all duration-200 font-mono"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              {t.dismiss}
            </button>
          </div>

          <style>{`@keyframes scanline { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
        </div>
      )}
    </div>
  );
}
