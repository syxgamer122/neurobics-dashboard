import { useState, useEffect, useCallback, useRef } from "react";
import { LangProvider, useLang } from "./lib/i18n";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Brain,
  ChevronRight,
  Flame,
  Clock,
  TrendingUp,
  Star,
  Zap,
  Activity,
  Terminal,
  RefreshCw,
  CheckCircle,
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

import { SchulteTableGame } from "./games/schulte-game";
import { SudokuGame } from "./games/sudoku-game";
import { StroopGame } from "./games/stroop-game";
import { MemoryMatrixGame } from "./games/memory-game";
import { ReactionTimeGame } from "./games/reaction-game";

import { GlassCard } from "./components/ui/glass-card";
import { GameTile } from "./components/ui/game-tile";
import { Label } from "./components/ui/label";
import { StatMini } from "./components/ui/stat-mini";
import {
  RoundResultOverlay,
  type RoundResult,
  type RoundAxisRow,
} from "./components/ui/round-result-overlay";

import {
  getAccessToken,
  fetchProfile,
  handleLogout,
  saveBirthYear,
  fetchPopulationStats,
  cognitiveIndex,
  fetchActivityStats,
  startRound,
  submitRound,
  type RoundGame,
  type RoundTicket,
  type ActivityStats,
  type Profile,
} from "./lib/api";
import {
  RATING_MAX,
  sanitizeRating,
  pullUpRating,
  calcBrainAge,
  DEFAULT_POPULATION,
  type AxisRatings,
  type PopulationStats,
} from "./lib/scoring";
import { getLevelProgress, getLevelTitle, getLevelColor } from "./lib/xp";
import { totalSessions } from "./lib/sessions";
import { AXIS_META, type AxisKey } from "./lib/axes";

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

/**
 * Converts a round's per-axis ratings into the columns to persist and the rows
 * to display. Axes a game does not measure come back `null` from the scorer and
 * are skipped entirely — Sudoku never writes Focus, Stroop never writes Logic.
 * This is what keeps the five axes genuinely independent.
 */
function applyAxes(
  profile: Profile,
  axes: AxisRatings,
  serverProfile: Profile | null | undefined,
  labels: Record<AxisKey, string>,
) {
  const rows: RoundAxisRow[] = [];

  (Object.keys(AXIS_META) as AxisKey[]).forEach((key) => {
    const round = axes[key];
    if (round === null) return;
    const meta = AXIS_META[key];
    const prev = sanitizeRating(
      profile[meta.column as keyof Profile] as number | null,
    );
    // Server đã tính và ghi giá trị chính thức vào DB rồi, nên lấy thẳng từ đó
    // thay vì chạy lại công thức ở client. Chỉ tự tính khi không có hồ sơ server.
    const next = serverProfile
      ? sanitizeRating(
          serverProfile[meta.column as keyof Profile] as number | null,
        )
      : pullUpRating(prev, round);
    rows.push({
      label: labels[key],
      color: meta.color,
      round,
      prev,
      next,
    });
  });

  return { rows };
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
        console.error("Session restore error:", err);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const refreshProfile = async () => {
    try {
      setProfile(await fetchProfile());
    } catch (err) {
      console.error("Refresh profile error:", err);
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
        console.error(
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
      console.error("Save birth year failed:", err);
      toast.error(t.save_failed);
    } finally {
      setSavingAge(false);
    }
  };

  // Called after a game round has saved its scores. `saved` is the confirmed row
  // returned by the write (.update().select().single()), so we render it
  // immediately — no round-trip that could read stale/replicated data. Then we
  // update the VN-timezone streak (which returns the latest row too) and, as a
  // final safety net, re-fetch from Supabase so the dashboard always reflects
  // exactly what's persisted.
  const roundTicketsRef = useRef<Partial<Record<RoundGame, RoundTicket>>>({});

  const prepareRound = useCallback(
    async (
      game: RoundGame,
      opts?: { force?: boolean },
    ): Promise<RoundTicket> => {
      // Reuse a still-valid ticket unless the caller forces a fresh mint
      // (idle→playing) so server startedAt matches real play time.
      if (!opts?.force) {
        const existing = roundTicketsRef.current[game];
        if (existing && Date.parse(existing.expiresAt) > Date.now())
          return existing;
      }
      const ticket = await startRound(game);
      roundTicketsRef.current[game] = ticket;
      return ticket;
    },
    [],
  );

  // Warm mot ticket khi mo game. onPlayStart se DUNG LAI ticket nay thay vi
  // mint them ticket thu hai; telemetry time van do rieng trong game.
  useEffect(() => {
    if (!selectedGame) return;
    prepareRound(selectedGame).catch((err) =>
      console.error("Prepare round failed:", err),
    );
  }, [selectedGame, prepareRound]);

  const beginPlay = useCallback(
    (game: RoundGame) => {
      // Reuse ticket da warm. Truoc day force=true moi lan bam Choi tao ticket
      // moi, de ticket cu mo 3 gio va nhanh chong cham tran 429.
      void prepareRound(game).catch((err) =>
        console.error("Play-start ticket prepare failed:", err),
      );
    },
    [prepareRound],
  );

  const completeRound = useCallback(
    async (game: RoundGame, telemetry: unknown) => {
      // CRITICAL: do NOT mint inside the submit path before the request.
      // A fresh ticket here would reset startedAt and break elapsed checks.
      const ticket = roundTicketsRef.current[game];
      if (!ticket) {
        // Best-effort re-mint so the next attempt is not stuck forever.
        void prepareRound(game, { force: true }).catch(() => {});
        throw new Error("Round ticket missing. Start the game again.");
      }
      if (Date.parse(ticket.expiresAt) <= Date.now()) {
        delete roundTicketsRef.current[game];
        void prepareRound(game, { force: true }).catch(() => {});
        throw new Error("Round ticket expired. Start the game again.");
      }
      try {
        const result = await submitRound(ticket.roundId, game, telemetry);
        setProfile(result.profile);
        // Submit thanh cong: ticket da bi transaction dot.
        delete roundTicketsRef.current[game];
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Chi xoa khi server khang dinh ticket khong con dung duoc. Loi mang
        // khong ro ket qua thi giu ticket de nut "Gui lai" co the thu that.
        if (
          /already submitted|expired|ticket not found|round rejected/i.test(msg)
        )
          delete roundTicketsRef.current[game];
        throw err;
      }
    },
    [prepareRound],
  );

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

  /**
   * Gui telemetry cua mot van len server.
   *
   * Truoc day loi mang = mat trang ca van: catch -> toast -> het, khong con
   * duong nao lay lai. Gio payload duoc closure cua nut "Gui lai" giu trong
   * phien hien tai. Khong ghi localStorage vi ticket/ref khong song qua reload.
   *
   * Luu y: neu server DA nhan va burn ticket ("already submitted"/"expired")
   * thi gui lai vo nghia — truong hop do khong stash va khong hien nut retry.
   */
  const submitTelemetry = useCallback(
    async (game: RoundGame, tel: unknown): Promise<boolean> => {
      // Capture baseline BEFORE await — profile state may change during submit.
      const baseline = profileRef.current;
      try {
        const result = await completeRound(game, tel);
        const { rows } = applyAxes(
          baseline ?? result.profile,
          result.axes,
          result.profile,
          axisLabels(),
        );
        setRoundResult({
          game,
          timeMs: result.timeMs,
          label: result.label,
          headline: result.headline,
          rows,
          xpAwarded: result.xpAwarded,
          xpLevel: result.level,
          leveledUp: result.leveledUp,
        });
        setGamificationKey((k) => k + 1);
        return true;
      } catch (err) {
        console.error(`${game} submit failed:`, err);
        const msg = err instanceof Error ? err.message : String(err);
        const ticketGone = /already submitted|expired|ticket not found/i.test(
          msg,
        );

        if (!ticketGone) {
          toast.error(t.save_failed, {
            action: {
              label: t.retry_send,
              onClick: () => {
                void submitTelemetryRef.current?.(game, tel);
              },
            },
            duration: 15000,
          });
        } else {
          toast.error(/ticket/i.test(msg) ? msg : t.save_failed);
        }
        return false;
      }
    },
    [completeRound, t.save_failed, t.retry_send, axisLabels],
  );

  // Ref de nut "Gui lai" trong toast luon goi ban moi nhat cua submitTelemetry
  // ma khong tao vong phu thuoc trong useCallback.
  const submitTelemetryRef = useRef(submitTelemetry);
  useEffect(() => {
    submitTelemetryRef.current = submitTelemetry;
  }, [submitTelemetry]);

  const makeGameHandler = useCallback(
    (game: RoundGame) => async (tel: unknown) => {
      await submitTelemetry(game, tel);
    },
    [submitTelemetry],
  );

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
      .catch((err) => console.error("Activity stats failed:", err));
  }, [profile?.id, profile?.total_xp]);

  if (!authChecked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#050A18" }}
      >
        <Loader2 size={28} className="animate-spin text-[#00D4FF]" />
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
          <span
            className="text-lg font-bold tracking-[0.22em] text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            NEUROBICS
          </span>
          <span
            className="text-[11px] rounded px-2 py-0.5 tracking-widest ml-1"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(0,212,255,0.08)",
              color: "#00D4FF",
              border: "1px solid rgba(0,212,255,0.18)",
            }}
          >
            v2.4.1
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div
            className="hidden md:flex items-center gap-2 text-xs text-slate-500"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <Activity size={12} className="text-[#00D4FF]" />
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
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold uppercase"
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
              <div
                className="text-[11px] text-slate-500"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {profile.synapse_streak} {t.day_streak}
              </div>
            </div>
          </div>
          <button
            onClick={toggle}
            title="Switch language"
            className="h-9 px-3 rounded-xl flex items-center justify-center text-xs font-bold tracking-wider transition-all duration-150 hover:brightness-125"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
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
                <GlassCard accent="#00D4FF" className="p-6 flex-1">
                  <Label color="#00D4FF">{t.cognitive_index}</Label>
                  <div className="flex items-baseline gap-2 mt-3 mb-1">
                    <span
                      className="text-7xl font-bold text-white"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        textShadow: "0 0 40px rgba(0,212,255,0.55)",
                      }}
                    >
                      {displayIndex(profile)}
                    </span>
                    <span
                      className="text-lg text-slate-500"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      / {RATING_MAX}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={13} className="text-emerald-400" />
                    <span
                      className="text-sm text-emerald-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {t.balanced_avg}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(displayIndex(profile) / RATING_MAX) * 100}%`,
                        background: "linear-gradient(90deg, #00D4FF, #A855F7)",
                        boxShadow: "0 0 14px rgba(0,212,255,0.6)",
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                  <div
                    className="flex justify-between mt-1.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    <span className="text-[11px] text-slate-600">
                      {t.apprentice}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      {t.mastermind}
                    </span>
                  </div>
                </GlassCard>

                <GlassCard accent="#A855F7" className="p-6">
                  <Label color="#A855F7">{t.brain_age}</Label>

                  {/* Brain age is only shown once it can actually mean something:
                  we need the player's real age to shift from, and enough rounds
                  to rank them. Anything less would be a decorative number. */}
                  {brainAge.status === "needs_age" ? (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="text-xs text-slate-400 leading-relaxed">
                        {t.brain_age_needs_age}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={birthYearInput}
                          onChange={(e) =>
                            setBirthYearInput(
                              e.target.value.replace(/\D/g, "").slice(0, 4),
                            )
                          }
                          inputMode="numeric"
                          placeholder={t.birth_year_placeholder}
                          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm text-white outline-none"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(168,85,247,0.25)",
                          }}
                        />
                        <button
                          onClick={submitBirthYear}
                          disabled={savingAge}
                          className="px-4 py-2 rounded-xl text-xs font-bold tracking-wider shrink-0 transition-all duration-150 hover:brightness-125 disabled:opacity-60"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            background: "rgba(168,85,247,0.18)",
                            color: "#A855F7",
                            border: "1px solid rgba(168,85,247,0.4)",
                          }}
                        >
                          {savingAge ? t.saving : t.save_btn}
                        </button>
                      </div>
                    </div>
                  ) : brainAge.status === "calibrating" ? (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="text-xs text-slate-400 leading-relaxed">
                        {t.brain_age_calibrating(
                          brainAge.roundsPlayed,
                          brainAge.roundsNeeded,
                        )}
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(brainAge.roundsPlayed / brainAge.roundsNeeded) * 100}%`,
                            background:
                              "linear-gradient(90deg, #A855F7, #00D4FF)",
                            transition: "width 0.6s ease",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-5 mt-4">
                      <div className="relative shrink-0">
                        <svg width="88" height="88" viewBox="0 0 88 88">
                          <defs>
                            <linearGradient
                              id="ageGrad"
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="0%"
                            >
                              <stop offset="0%" stopColor="#A855F7" />
                              <stop offset="100%" stopColor="#00D4FF" />
                            </linearGradient>
                          </defs>
                          <circle
                            cx="44"
                            cy="44"
                            r="36"
                            fill="none"
                            stroke="rgba(168,85,247,0.12)"
                            strokeWidth="7"
                          />
                          <circle
                            cx="44"
                            cy="44"
                            r="36"
                            fill="none"
                            stroke="url(#ageGrad)"
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 36 * brainAge.ringPct} ${2 * Math.PI * 36 * (1 - brainAge.ringPct)}`}
                            strokeDashoffset={2 * Math.PI * 36 * 0.25}
                            style={{
                              filter:
                                "drop-shadow(0 0 8px rgba(168,85,247,0.7))",
                              transition: "stroke-dasharray 0.8s ease",
                            }}
                          />
                          <text
                            x="44"
                            y="49"
                            textAnchor="middle"
                            fill="white"
                            fontSize="20"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {brainAge.age}
                          </text>
                        </svg>
                      </div>
                      <div>
                        <div
                          className="text-4xl font-bold text-white"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {brainAge.age} {t.yrs_unit}
                        </div>
                        <div className="text-xs text-slate-400 mt-1.5">
                          {t.brain_age_percentile(
                            Math.round(brainAge.percentile * 100),
                            brainAge.realAge,
                          )}
                        </div>
                        <div
                          className="text-xs mt-1 font-semibold"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color:
                              brainAge.delta === 0
                                ? "#94A3B8"
                                : brainAge.delta > 0
                                  ? "#10B981"
                                  : "#F43F5E",
                          }}
                        >
                          {/* delta === 0 truoc day roi vao nhanh ">= 0" va hien
                              "Tre hon 0 tuoi" — vo nghia. Tach nhanh rieng. */}
                          {brainAge.delta === 0
                            ? t.yrs_same
                            : brainAge.delta > 0
                              ? t.yrs_younger(brainAge.delta)
                              : t.yrs_older(Math.abs(brainAge.delta))}
                        </div>
                        {brainAge.provisional && (
                          <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                            {t.brain_age_provisional}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </GlassCard>
              </div>

              <GlassCard accent="#00D4FF" className="lg:col-span-2 p-6">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <Label color="#00D4FF">{t.cog_matrix}</Label>
                    <div className="text-sm text-slate-400 mt-1">
                      {t.cog_matrix_sub(totalRounds(profile))}
                    </div>
                  </div>
                  <div
                    className="text-xs px-3 py-1.5 rounded-lg shrink-0"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "rgba(168,85,247,0.1)",
                      color: "#A855F7",
                      border: "1px solid rgba(168,85,247,0.2)",
                    }}
                  >
                    {t.live}
                  </div>
                </div>
                <div className="h-[270px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      data={cognitiveData}
                      margin={{ top: 10, right: 30, bottom: 10, left: 30 }}
                    >
                      <PolarGrid
                        key="polar-grid"
                        stroke="rgba(0,212,255,0.09)"
                      />
                      <PolarAngleAxis
                        key="polar-angle"
                        dataKey="subject"
                        tick={{
                          fill: "#94a3b8",
                          fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      />
                      <PolarRadiusAxis
                        key="polar-radius"
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        key="radar-cognition"
                        name="Cognition"
                        dataKey="value"
                        stroke="#00D4FF"
                        fill="#00D4FF"
                        fillOpacity={0.12}
                        strokeWidth={2}
                        isAnimationActive={false}
                        dot={false}
                        style={{
                          filter: "drop-shadow(0 0 8px rgba(0,212,255,0.5))",
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div
                  className="grid grid-cols-5 gap-2 pt-2"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                  {cognitiveData.map((d) => (
                    <div key={d.subject} className="text-center">
                      <div
                        className="text-[11px] text-slate-500 mb-0.5"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {d.subject.slice(0, 3).toUpperCase()}
                      </div>
                      <div
                        className="text-sm font-bold text-white"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {d.value}
                      </div>
                      <div
                        className="h-1 rounded-full mt-1"
                        style={{
                          background:
                            "linear-gradient(90deg, #00D4FF, #A855F7)",
                          opacity: d.value / 100,
                          boxShadow: "0 0 6px rgba(0,212,255,0.4)",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </>
        )}

        {activePage === "play" && (
          <>
            {/* Section divider */}
            <div className="flex items-center gap-4 pt-1">
              <Zap
                size={14}
                className="text-[#00D4FF] shrink-0"
                style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }}
              />
              <span
                className="text-[11px] text-white tracking-[0.25em] uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
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
                    fontFamily: "'JetBrains Mono', monospace",
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
              <GlassCard accent={levelColor} className="p-6">
                <div className="flex items-center gap-5">
                  <div
                    className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${levelColor}, ${levelColor}88)`,
                      boxShadow: `0 0 40px ${levelColor}44`,
                    }}
                  >
                    <span
                      className="text-3xl font-bold text-white leading-none"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {levelProgress.level}
                    </span>
                    <span
                      className="text-[8px] tracking-widest text-white/70 mt-0.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      LV
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label color={levelColor}>
                      {getLevelTitle(levelProgress.level)}
                    </Label>
                    <div className="flex items-baseline gap-2 mt-1 mb-2">
                      <span
                        className="text-2xl font-bold text-white"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {levelProgress.xpIntoLevel}
                      </span>
                      <span
                        className="text-sm text-slate-500"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        / {levelProgress.xpNeeded} XP
                      </span>
                      <span
                        className="ml-auto text-xs text-slate-500"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {t.total_xp_label}:{" "}
                        {(profile.total_xp ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, levelProgress.progress * 100)}%`,
                          background: `linear-gradient(90deg, ${levelColor}, ${levelColor}aa)`,
                          boxShadow: `0 0 10px ${levelColor}66`,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* ROW 3: Streak */}
            <div className="grid grid-cols-1 gap-5">
              <GlassCard accent="#F59E0B" className="p-6">
                <Label color="#F59E0B">{t.synapse_streak}</Label>
                <div className="flex items-center gap-5 mt-4">
                  <div className="relative shrink-0">
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center streak-glow"
                      style={{
                        background: "linear-gradient(135deg, #F59E0B, #EF4444)",
                      }}
                    >
                      <Brain size={34} className="text-white" />
                    </div>
                    <div
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        background: "#EF4444",
                        boxShadow: "0 0 12px rgba(239,68,68,0.5)",
                      }}
                    >
                      <Flame size={13} className="text-white" />
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-6xl font-bold text-white leading-none"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        textShadow: "0 0 24px rgba(245,158,11,0.5)",
                      }}
                    >
                      {profile.synapse_streak}
                    </div>
                    <div
                      className="text-sm text-slate-400 mt-1.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {t.day_streak}
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-6 h-2 rounded-full"
                          style={
                            i <
                            (profile.synapse_streak > 0
                              ? ((profile.synapse_streak - 1) % 7) + 1
                              : 0)
                              ? {
                                  background:
                                    "linear-gradient(90deg, #F59E0B, #EF4444)",
                                  boxShadow: "0 0 6px rgba(245,158,11,0.5)",
                                }
                              : { background: "rgba(255,255,255,0.07)" }
                          }
                        />
                      ))}
                    </div>
                    <div
                      className="text-[11px] text-slate-600 mt-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {t.streak_week_label}
                      {" · "}
                      {t.streak_tz_note}
                    </div>
                  </div>
                </div>
                <div
                  className="grid grid-cols-3 gap-3 mt-5 pt-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <StatMini
                    label={t.synapse_streak}
                    value={String(profile.synapse_streak)}
                    unit={t.days}
                    color="#F59E0B"
                  />
                  <StatMini
                    label={t.this_month}
                    value={String(activity.sessionsThisMonth)}
                    unit={t.sessions}
                    color="#A855F7"
                  />
                  <StatMini
                    label={t.xp_today}
                    value={String(activity.xpToday)}
                    unit={t.pts}
                    color="#00D4FF"
                  />
                </div>
              </GlassCard>
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
                  fontFamily: "'JetBrains Mono', monospace",
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
                className="text-2xl font-bold tracking-[0.3em]"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#EF4444",
                  textShadow: "0 0 20px rgba(239,68,68,0.6)",
                }}
              >
                {t.access_denied_title}
              </div>
              <div
                className="text-[11px] tracking-widest text-red-700"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
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
                <div
                  key={label}
                  className="flex items-center gap-2"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <span
                    className="text-[11px] w-20 shrink-0"
                    style={{ color: "rgba(239,68,68,0.5)" }}
                  >
                    {label}
                  </span>
                  <span className="text-[11px]" style={{ color }}>
                    {">"} {value}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setAccessDenied(false)}
              className="w-full py-2 rounded-xl text-xs tracking-widest font-bold transition-all duration-200"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
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
