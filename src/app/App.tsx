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
} from "lucide-react";
import { AdminPanel } from "./components/admin-panel";
import { AuthScreen } from "./components/auth-screen";
import { FloatingDock, type DockPage } from "./components/floating-dock";
import {
  getAccessToken,
  fetchProfile,
  handleLogout,
  saveScores,
  saveBirthYear,
  recordDailyActivity,
  fetchPopulationStats,
  cognitiveIndex,
  type Profile,
} from "./lib/api";
import {
  RATING_MAX,
  sanitizeRating,
  pullUpRating,
  scoreSchulte,
  scoreSudoku,
  scoreStroop,
  scoreMemory,
  scoreReaction,
  calcBrainAge,
  roundHeadline,
  SUDOKU_DIFF_FACTOR,
  CALIBRATION_ROUNDS,
  DEFAULT_POPULATION,
  type AxisRatings,
  type PopulationStats,
  type SchulteTelemetry,
  type SudokuTelemetry,
  type StroopTelemetry,
  type MemoryTelemetry,
  type ReactionTelemetry,
} from "./lib/scoring";
import { LogOut, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";

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

/** Total rounds across all three games — drives brain-age calibration. */
const totalRounds = (p: Profile) =>
  (p.schulte_sessions ?? 0) + (p.sudoku_sessions ?? 0) + (p.stroop_sessions ?? 0);

// Each domain is the stored proficiency rating (0–RATING_MAX) mapped to 0–100
// for the radar. No session division: the rating is already a moving average.
function buildCognitiveDataRaw(p: Profile) {
  const toPct = (r: number | null | undefined) => clamp100(((r ?? 0) / RATING_MAX) * 100);
  return [
    { subject: "Memory",  value: toPct(p.memory_score) },
    { subject: "Focus",   value: toPct(p.focus_score) },
    { subject: "Logic",   value: toPct(p.algebraic_logic_score) },
    { subject: "Spatial", value: toPct(p.cfop_spatial_record) },
    { subject: "Speed",   value: toPct(p.speed_score) },
  ];
}

function buildCognitiveData(p: Profile) {
  return buildCognitiveDataRaw(p);
}

// ─── Round result ─────────────────────────────────────────────────────────────

export type RoundAxisRow = {
  label: string;
  color: string;
  /** What this round alone scored on the axis. */
  round: number;
  /** Stored rating before the round. */
  prev: number;
  /** Stored rating after the round. */
  next: number;
};

export type RoundResult = {
game: "schulte" | "sudoku" | "stroop" | "memory" | "reaction";
  timeMs: number;
  /** Only the axes this game actually measures. */
  rows: RoundAxisRow[];
  /** Best axis earned this round, for the headline badge. */
  headline: number;
  label: string; // e.g. "5×5 Classic" or "Expert"
};

// Axis display metadata plus the profile column each axis persists to.
const AXIS_META = {
  speed:   { label: "Speed",   color: "#10B981", column: "speed_score" },
  focus:   { label: "Focus",   color: "#A855F7", column: "focus_score" },
  spatial: { label: "Spatial", color: "#F59E0B", column: "cfop_spatial_record" },
  logic:   { label: "Logic",   color: "#00D4FF", column: "algebraic_logic_score" },
  memory:  { label: "Memory",  color: "#F43F5E", column: "memory_score" },
} as const;

type AxisKey = keyof typeof AXIS_META;

/**
 * Converts a round's per-axis ratings into the columns to persist and the rows
 * to display. Axes a game does not measure come back `null` from the scorer and
 * are skipped entirely — Sudoku never writes Focus, Stroop never writes Logic.
 * This is what keeps the five axes genuinely independent.
 */
function applyAxes(profile: Profile, axes: AxisRatings) {
  const updates: Record<string, number> = {};
  const rows: RoundAxisRow[] = [];

  (Object.keys(AXIS_META) as AxisKey[]).forEach((key) => {
    const round = axes[key];
    if (round === null) return;
    const meta = AXIS_META[key];
    const prev = sanitizeRating(profile[meta.column as keyof Profile] as number | null);
    const next = pullUpRating(prev, round);
    updates[meta.column] = next;
    rows.push({ label: meta.label, color: meta.color, round, prev, next });
  });

  return { updates, rows };
}

// ─── Schulte Table helpers ─────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newSchulteGrid(size: number): number[] {
  return shuffleArray(Array.from({ length: size * size }, (_, i) => i + 1));
}

// ─── Sudoku helpers ────────────────────────────────────────────────────────────

export type Difficulty = "Easy" | "Medium" | "Hard" | "Expert" | "Master" | "Extreme";

// clues = how many numbers remain on the initial board (fewer = harder);
// points = algebraic_logic_score reward for solving at that level.
// Clue counts follow sudoku.com's 6-tier scale (Easy 38 → Extreme 23);
// points scale the algebraic_logic_score reward per solve.
const SUDOKU_LEVELS: { id: Difficulty; clues: number; points: number; accent: string }[] = [
  { id: "Easy", clues: 38, points: 1, accent: "#10B981" },
  { id: "Medium", clues: 36, points: 2, accent: "#00D4FF" },
  { id: "Hard", clues: 32, points: 3, accent: "#A855F7" },
  { id: "Expert", clues: 30, points: 4, accent: "#F59E0B" },
  { id: "Master", clues: 26, points: 5, accent: "#F97316" },
  { id: "Extreme", clues: 23, points: 6, accent: "#F43F5E" },
];

function generateSudoku(clues = 34): { puzzle: (number | null)[][]; solution: number[][] } {
  // Base valid sudoku pattern
  const base: number[][] = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8],
  ];

  // Relabel numbers randomly
  const numMap = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let grid = base.map((row) => row.map((n) => numMap[n - 1]));

  // Shuffle rows within each band of 3
  for (let band = 0; band < 3; band++) {
    const perm = shuffleArray([0, 1, 2]);
    const rows = [grid[band * 3 + perm[0]], grid[band * 3 + perm[1]], grid[band * 3 + perm[2]]];
    grid[band * 3] = rows[0];
    grid[band * 3 + 1] = rows[1];
    grid[band * 3 + 2] = rows[2];
  }

  // Shuffle columns within each stack of 3
  for (let stack = 0; stack < 3; stack++) {
    const perm = shuffleArray([0, 1, 2]);
    grid = grid.map((row) => {
      const newRow = [...row];
      newRow[stack * 3] = row[stack * 3 + perm[0]];
      newRow[stack * 3 + 1] = row[stack * 3 + perm[1]];
      newRow[stack * 3 + 2] = row[stack * 3 + perm[2]];
      return newRow;
    });
  }

  // Shuffle row-bands
  const bandPerm = shuffleArray([0, 1, 2]);
  const shuffledGrid: number[][] = [];
  for (const b of bandPerm) {
    shuffledGrid.push(grid[b * 3], grid[b * 3 + 1], grid[b * 3 + 2]);
  }

  const solution = shuffledGrid.map((r) => [...r]);

  // Remove cells to create the puzzle, leaving `clues` numbers on the board.
  const puzzle: (number | null)[][] = solution.map((r) => [...r] as (number | null)[]);
  const positions = shuffleArray(Array.from({ length: 81 }, (_, i) => i));
  const toRemove = Math.max(0, 81 - clues);
  for (let i = 0; i < toRemove; i++) {
    const r = Math.floor(positions[i] / 9);
    const c = positions[i] % 9;
    puzzle[r][c] = null;
  }

  return { puzzle, solution };
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
  const [pulse, setPulse] = useState(false);
  const [activePage, setActivePage] = useState<DockPage>("dashboard");
const [selectedGame, setSelectedGame] = useState<
  "schulte" | "sudoku" | "stroop" | "memory" | "reaction" | null
>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
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
        console.error("Population stats unavailable, using seed baseline:", err);
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
  const finishRound = async (saved?: Profile) => {
    if (saved) setProfile(saved);
    try {
      const withStreak = await recordDailyActivity();
      setProfile(withStreak);
    } catch (err) {
      console.error("Streak update skipped:", err);
      await refreshProfile();
    }
  };

  const onLogout = async () => {
    await handleLogout();
    setProfile(null);
    setAdminPanelOpen(false);
  };

  const [timer, setTimer] = useState({ h: 14, m: 23, s: 7 });

  useEffect(() => {
    const i = setInterval(() => setPulse((p) => !p), 1800);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      setTimer((t) => {
        if (t.s > 0) return { ...t, s: t.s - 1 };
        if (t.m > 0) return { ...t, m: t.m - 1, s: 59 };
        if (t.h > 0) return { h: t.h - 1, m: 59, s: 59 };
        return t;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050A18" }}>
        <Loader2 size={28} className="animate-spin text-[#00D4FF]" />
      </div>
    );
  }

  if (!profile) {
    return <AuthScreen onAuthed={async (p) => (p ? setProfile(p) : refreshProfile())} />;
  }

  const isAdmin = profile.username.trim().toLowerCase() === "nguyenhuumanh";

  const cognitiveData = buildCognitiveData(profile);
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
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{ top: "-15%", left: "-8%", width: 700, height: 700, background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: "25%", right: "-12%", width: 600, height: 600, background: "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ bottom: "-10%", left: "35%", width: 500, height: 500, background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
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
            style={{ background: "linear-gradient(135deg, #00D4FF, #7C3AED)", boxShadow: "0 0 20px rgba(0,212,255,0.4)" }}
          >
            <Brain size={17} className="text-white" />
          </div>
          <span className="text-lg font-bold tracking-[0.22em] text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            NEUROBICS
          </span>
          <span
            className="text-[10px] rounded px-2 py-0.5 tracking-widest ml-1"
            style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(0,212,255,0.08)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.18)" }}
          >
            v2.4.1
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <Activity size={12} className="text-[#00D4FF]" />
            <span>{t.league}</span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "rgba(13,20,45,0.6)", border: "1px solid rgba(0,212,255,0.1)" }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase" style={{ background: "linear-gradient(135deg, #A855F7, #7C3AED)" }}>
              {profile.username.slice(0, 2)}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{profile.username}</div>
              <div className="text-[10px] text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {profile.synapse_streak} {t.day_streak}
              </div>
            </div>
          </div>
          <button
            onClick={toggle}
            title="Switch language"
            className="h-9 px-3 rounded-xl flex items-center justify-center text-xs font-bold tracking-wider transition-all duration-150 hover:brightness-125"
            style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(13,20,45,0.6)", border: "1px solid rgba(0,212,255,0.15)", color: "#00D4FF" }}
          >
            {lang === "vi" ? "EN" : "VI"}
          </button>
          <button
            onClick={onLogout}
            title="Sign out"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
            style={{ background: "rgba(13,20,45,0.6)", border: "1px solid rgba(0,212,255,0.1)" }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 max-w-[1380px] mx-auto px-5 py-7 pb-32 space-y-6">

        {activePage === "dashboard" && (<>
        {/* ROW 1: Scores + Radar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="flex flex-col gap-5">
            <GlassCard accent="#00D4FF" className="p-6 flex-1">
              <Label color="#00D4FF">{t.cognitive_index}</Label>
              <div className="flex items-baseline gap-2 mt-3 mb-1">
                <span className="text-7xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 40px rgba(0,212,255,0.55)" }}>
                  {displayIndex(profile)}
                </span>
                <span className="text-lg text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>/ {RATING_MAX}</span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={13} className="text-emerald-400" />
                <span className="text-sm text-emerald-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.balanced_avg}</span>
                <span className="ml-auto text-xs text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Top —</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${(displayIndex(profile) / RATING_MAX) * 100}%`, background: "linear-gradient(90deg, #00D4FF, #A855F7)", boxShadow: "0 0 14px rgba(0,212,255,0.6)", transition: "width 0.6s ease" }} />
              </div>
              <div className="flex justify-between mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span className="text-[10px] text-slate-600">{t.apprentice}</span>
                <span className="text-[10px] text-slate-600">{t.mastermind}</span>
              </div>
            </GlassCard>

            <GlassCard accent="#A855F7" className="p-6">
              <Label color="#A855F7">{t.brain_age}</Label>

              {/* Brain age is only shown once it can actually mean something:
                  we need the player's real age to shift from, and enough rounds
                  to rank them. Anything less would be a decorative number. */}
              {brainAge.status === "needs_age" ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="text-xs text-slate-400 leading-relaxed">{t.brain_age_needs_age}</div>
                  <div className="flex gap-2">
                    <input
                      value={birthYearInput}
                      onChange={(e) => setBirthYearInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      placeholder={t.birth_year_placeholder}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm text-white outline-none"
                      style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.25)" }}
                    />
                    <button
                      onClick={submitBirthYear}
                      disabled={savingAge}
                      className="px-4 py-2 rounded-xl text-xs font-bold tracking-wider shrink-0 transition-all duration-150 hover:brightness-125 disabled:opacity-60"
                      style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(168,85,247,0.18)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.4)" }}
                    >
                      {savingAge ? t.saving : t.save_btn}
                    </button>
                  </div>
                </div>
              ) : brainAge.status === "calibrating" ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="text-xs text-slate-400 leading-relaxed">
                    {t.brain_age_calibrating(brainAge.roundsPlayed, brainAge.roundsNeeded)}
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(brainAge.roundsPlayed / brainAge.roundsNeeded) * 100}%`,
                        background: "linear-gradient(90deg, #A855F7, #00D4FF)",
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
                        <linearGradient id="ageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#A855F7" />
                          <stop offset="100%" stopColor="#00D4FF" />
                        </linearGradient>
                      </defs>
                      <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth="7" />
                      <circle cx="44" cy="44" r="36" fill="none" stroke="url(#ageGrad)" strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 36 * brainAge.ringPct} ${2 * Math.PI * 36 * (1 - brainAge.ringPct)}`}
                        strokeDashoffset={2 * Math.PI * 36 * 0.25}
                        style={{ filter: "drop-shadow(0 0 8px rgba(168,85,247,0.7))", transition: "stroke-dasharray 0.8s ease" }}
                      />
                      <text x="44" y="49" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="JetBrains Mono, monospace">{brainAge.age}</text>
                    </svg>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{brainAge.age} yrs</div>
                    <div className="text-xs text-slate-400 mt-1.5">
                      {t.brain_age_percentile(Math.round(brainAge.percentile * 100), brainAge.realAge)}
                    </div>
                    <div
                      className="text-xs mt-1 font-semibold"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: brainAge.delta >= 0 ? "#10B981" : "#F43F5E" }}
                    >
                      {brainAge.delta >= 0 ? t.yrs_younger(brainAge.delta) : t.yrs_older(Math.abs(brainAge.delta))}
                    </div>
                    {brainAge.provisional && (
                      <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">{t.brain_age_provisional}</div>
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
                <div className="text-sm text-slate-400 mt-1">{t.cog_matrix_sub}</div>
              </div>
              <div className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(168,85,247,0.1)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.2)" }}>{t.live}</div>
            </div>
            <div className="h-[270px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={cognitiveData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid key="polar-grid" stroke="rgba(0,212,255,0.09)" />
                  <PolarAngleAxis key="polar-angle" dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
                  <PolarRadiusAxis key="polar-radius" domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar key="radar-cognition" name="Cognition" dataKey="value" stroke="#00D4FF" fill="#00D4FF" fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} dot={false} style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.5))" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-5 gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              {cognitiveData.map((d) => (
                <div key={d.subject} className="text-center">
                  <div className="text-[10px] text-slate-500 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.subject.slice(0, 3).toUpperCase()}</div>
                  <div className="text-sm font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.value}</div>
                  <div className="h-1 rounded-full mt-1" style={{ background: "linear-gradient(90deg, #00D4FF, #A855F7)", opacity: d.value / 100, boxShadow: "0 0 6px rgba(0,212,255,0.4)" }} />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
        </>)}

        {activePage === "play" && (<>
        {/* Section divider */}
        <div className="flex items-center gap-4 pt-1">
          <Zap size={14} className="text-[#00D4FF] shrink-0" style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }} />
          <span className="text-[11px] text-white tracking-[0.25em] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.arena}</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,212,255,0.3), transparent)" }} />
          {selectedGame ? (
            <button
              onClick={() => setSelectedGame(null)}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "#00D4FF" }}
            >
              <ChevronRight size={12} className="rotate-180" /> {t.back_to_arena}
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
  tag="SPEED TRAINING"
  title="Reaction Time"
  desc="Chờ tín hiệu chuyển xanh rồi phản ứng nhanh nhất có thể. Bấm sớm sẽ bị phạt."
  playLabel="PLAY NOW"
  onPlay={() => setSelectedGame("reaction")}
/>
            <GameTile
              accent="#F43F5E"
              icon={<Brain size={22} />}
              tag="MEMORY TRAINING"
              title="Memory Matrix"
              desc="Ghi nhớ vị trí các ô sáng trên lưới. Độ khó tăng dần theo từng cấp độ."
              playLabel="PLAY NOW"
              onPlay={() => setSelectedGame("memory")}
            />
          </div>
        )}

        {selectedGame === "schulte" && (
          <div className="max-w-lg">
            <SchulteTableGame
              onComplete={async (tel) => {
                // Schulte measures visual search: Spatial, Focus and Speed only.
                // It says nothing about Logic or Memory, so those are untouched.
                const axes = scoreSchulte(tel);
                const { updates, rows } = applyAxes(profile, axes);
                try {
                  const saved = await saveScores({
                    ...updates,
                    schulte_sessions: (profile.schulte_sessions ?? 0) + 1,
                  } as Parameters<typeof saveScores>[0]);
                  await finishRound(saved);
                  setRoundResult({
                    game: "schulte", timeMs: tel.timeMs, label: tel.modeLabel,
                    headline: roundHeadline(axes), rows,
                  });
                } catch (err) {
                  console.error("Schulte onComplete: saving scores failed:", err);
                  toast.error(t.save_failed);
                }
              }}
            />
          </div>
        )}

        {selectedGame === "sudoku" && (
          <div className="max-w-md">
            <SudokuGame
              onComplete={async (tel) => {
                // Sudoku measures deduction and working memory: Logic, Memory,
                // Speed. Logic and Memory are deliberately time-free, so a slow
                // flawless solve still scores high on both.
                const axes = scoreSudoku(tel);
                const { updates, rows } = applyAxes(profile, axes);
                try {
                  const saved = await saveScores({
                    ...updates,
                    sudoku_sessions: (profile.sudoku_sessions ?? 0) + 1,
                  } as Parameters<typeof saveScores>[0]);
                  await finishRound(saved);
                  setRoundResult({
                    game: "sudoku", timeMs: tel.timeMs, label: tel.difficulty,
                    headline: roundHeadline(axes), rows,
                  });
                } catch (err) {
                  console.error("Sudoku onComplete: saving scores failed:", err);
                  toast.error(t.save_failed);
                }
              }}
            />
          </div>
        )}

        {selectedGame === "stroop" && (
          <div className="max-w-sm">
            <StroopGame
              onComplete={async (tel) => {
                // Stroop measures interference control: Focus and Speed only.
                const axes = scoreStroop(tel);
                const { updates, rows } = applyAxes(profile, axes);
                try {
                  const saved = await saveScores({
                    ...updates,
                    stroop_sessions: (profile.stroop_sessions ?? 0) + 1,
                  } as Parameters<typeof saveScores>[0]);
                  await finishRound(saved);
                  setRoundResult({
                    game: "stroop", timeMs: tel.timeMs, label: "Stroop Test",
                    headline: roundHeadline(axes), rows,
                  });
                } catch (err) {
                  console.error("Stroop onComplete: saving scores failed:", err);
                  toast.error(t.save_failed);
                }
              }}
            />
          </div>
        )}
{selectedGame === "reaction" && (
  <div className="max-w-sm">
    <ReactionTimeGame
      onComplete={async (tel) => {
        const axes = scoreReaction(tel);
        const { updates, rows } = applyAxes(profile, axes);

        try {
          const saved = await saveScores({
            ...updates,
          } as Parameters<typeof saveScores>[0]);

          await finishRound(saved);

          const average =
            tel.rts.length > 0
              ? Math.round(
                  tel.rts.reduce((sum, rt) => sum + rt, 0) /
                    tel.rts.length,
                )
              : 0;

          setRoundResult({
            game: "reaction",
            timeMs: tel.timeMs,
            label: `${average} ms average`,
            headline: roundHeadline(axes),
            rows,
          });
        } catch (err) {
          console.error("Reaction Time save failed:", err);
          toast.error(t.save_failed);
        }
      }}
    />
  </div>
)}
        {selectedGame === "memory" && (
          <div className="max-w-sm">
            <MemoryMatrixGame
              onComplete={async (tel) => {
                const axes = scoreMemory(tel);
const { updates, rows } = applyAxes(profile, axes);
try {
  const saved = await saveScores({
    ...updates,
  } as Parameters<typeof saveScores>[0]);
  await finishRound(saved);
  setRoundResult({
    game: "memory", timeMs: tel.timeMs, label: `Level ${tel.maxLevel}`,
    headline: roundHeadline(axes), rows,
  });
                } catch (err) {
                  console.error("Memory onComplete failed:", err);
                  toast.error(t.save_failed);
                }
              }}
            />
          </div>
        )}
        </>)}

        {activePage === "dashboard" && (<>
        {/* ROW 3: Streak */}
        <div className="grid grid-cols-1 gap-5">
          <GlassCard accent="#F59E0B" className="p-6">
            <Label color="#F59E0B">{t.synapse_streak}</Label>
            <div className="flex items-center gap-5 mt-4">
              <div className="relative shrink-0">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #F59E0B, #EF4444)",
                    boxShadow: pulse ? "0 0 50px rgba(245,158,11,0.65), 0 0 100px rgba(245,158,11,0.18)" : "0 0 24px rgba(245,158,11,0.35)",
                    transition: "box-shadow 1.8s ease",
                  }}
                >
                  <Brain size={34} className="text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#EF4444", boxShadow: "0 0 12px rgba(239,68,68,0.5)" }}>
                  <Flame size={13} className="text-white" />
                </div>
              </div>
              <div>
                <div className="text-6xl font-bold text-white leading-none" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 24px rgba(245,158,11,0.5)" }}>
                  {profile.synapse_streak}
                </div>
                <div className="text-sm text-slate-400 mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.day_streak}</div>
                <div className="flex gap-1.5 mt-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="w-6 h-2 rounded-full"
                      style={i < profile.synapse_streak % 7
                        ? { background: "linear-gradient(90deg, #F59E0B, #EF4444)", boxShadow: "0 0 6px rgba(245,158,11,0.5)" }
                        : { background: "rgba(255,255,255,0.07)" }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-slate-600 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>MON — SUN</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <StatMini label={t.best_streak} value={String(profile.synapse_streak)} unit={t.days} color="#F59E0B" />
              <StatMini label={t.this_month} value="0" unit={t.sessions} color="#A855F7" />
              <StatMini label={t.xp_today} value="0" unit={t.pts} color="#00D4FF" />
            </div>
          </GlassCard>
        </div>
        </>)}

        {activePage === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <GlassCard accent="#F59E0B" className="p-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold uppercase" style={{ background: "linear-gradient(135deg, #A855F7, #7C3AED)", boxShadow: "0 0 40px rgba(168,85,247,0.45)", fontFamily: "'JetBrains Mono', monospace" }}>
                {profile.username.slice(0, 2)}
              </div>
              <div className="text-xl font-bold text-white mt-4">{profile.username}</div>
              <div className="text-[11px] text-slate-500 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {isAdmin ? t.omega_label : t.operator_label}
              </div>
              <button
                onClick={onLogout}
                className="mt-6 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200"
                style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(244,63,94,0.1)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.28)" }}
              >
                <LogOut size={13} /> {t.sign_out}
              </button>
            </GlassCard>
            <GlassCard accent="#00D4FF" className="lg:col-span-2 p-6">
              <Label color="#00D4FF">{t.operator_stats}</Label>
              <div className="grid grid-cols-3 gap-4 mt-5">
                <StatMini label={t.cognitive_index} value={String(displayIndex(profile))} unit={t.pts} color="#00D4FF" />
                <StatMini label={t.synapse_streak} value={String(profile.synapse_streak)} unit={t.days} color="#F59E0B" />
                <StatMini label={t.clearance} value={isAdmin ? "Ω-1" : "STD"} unit={isAdmin ? "admin" : "user"} color="#A855F7" />
              </div>
            </GlassCard>
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
          style={{ background: "rgba(5,10,24,0.92)", backdropFilter: "blur(6px)" }}
          onClick={() => setAccessDenied(false)}
        >
          {/* Red radial pulse */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(239,68,68,0.18) 0%, transparent 65%)" }} />

          <div
            className="relative flex flex-col items-center gap-5 p-10 rounded-2xl max-w-sm w-full mx-4"
            style={{ background: "rgba(13,5,10,0.9)", border: "1px solid rgba(239,68,68,0.5)", boxShadow: "0 0 80px rgba(239,68,68,0.25), inset 0 0 40px rgba(239,68,68,0.04)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scan line animation */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              <div
                className="absolute w-full h-px opacity-20"
                style={{ background: "linear-gradient(90deg, transparent, #EF4444, transparent)", animation: "scanline 2s linear infinite", top: 0 }}
              />
            </div>

            {/* Icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.5)", boxShadow: "0 0 30px rgba(239,68,68,0.3)" }}
            >
              <Terminal size={28} style={{ color: "#EF4444", filter: "drop-shadow(0 0 8px rgba(239,68,68,0.8))" }} />
            </div>

            {/* Text */}
            <div className="text-center space-y-2">
              <div
                className="text-2xl font-bold tracking-[0.3em]"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "#EF4444", textShadow: "0 0 20px rgba(239,68,68,0.6)" }}
              >
                ACCESS DENIED
              </div>
              <div className="text-[11px] tracking-widest text-red-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {t.auth_level_msg}
              </div>
            </div>

            {/* Log lines */}
            <div
              className="w-full rounded-lg p-4 space-y-1.5 text-left"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(239,68,68,0.12)" }}
            >
              {[
                { label: "USER", value: profile?.username ?? "—", color: "#94a3b8" },
                { label: t.required_label, value: "nguyenhuumanh", color: "#EF4444" },
                { label: "CLEARANCE", value: "OMEGA-1", color: "#EF4444" },
                { label: t.status_label, value: t.unauthorized_label, color: "#EF4444" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <span className="text-[9px] w-20 shrink-0" style={{ color: "rgba(239,68,68,0.5)" }}>{label}</span>
                  <span className="text-[10px]" style={{ color }}>{">"} {value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setAccessDenied(false)}
              className="w-full py-2 rounded-xl text-xs tracking-widest font-bold transition-all duration-200"
              style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
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

// ─── Schulte Table Game ────────────────────────────────────────────────────────

type SMode = "classic" | "reverse" | "dual";
type SSize = 3 | 4 | 5 | 6;
interface SCell { value: number; color: "cyan" | "red" }

function buildSchulteGrid(size: SSize, mode: SMode): SCell[] {
  const total = size * size;
  if (mode === "dual") {
    const h1 = Math.ceil(total / 2);
    const h2 = Math.floor(total / 2);
    return shuffleArray([
      ...Array.from({ length: h1 }, (_, i) => ({ value: i + 1, color: "cyan" as const })),
      ...Array.from({ length: h2 }, (_, i) => ({ value: i + 1, color: "red" as const })),
    ]);
  }
  return shuffleArray(Array.from({ length: total }, (_, i) => ({ value: i + 1, color: "cyan" as const })));
}

function buildSchulteSeq(size: SSize, mode: SMode): Array<{ value: number; color: "cyan" | "red" }> {
  const total = size * size;
  if (mode === "classic") return Array.from({ length: total }, (_, i) => ({ value: i + 1, color: "cyan" as const }));
  if (mode === "reverse") return Array.from({ length: total }, (_, i) => ({ value: total - i, color: "cyan" as const }));
  const h1 = Math.ceil(total / 2), h2 = Math.floor(total / 2);
  const seq: Array<{ value: number; color: "cyan" | "red" }> = [];
  for (let i = 0; i < Math.max(h1, h2); i++) {
    if (i < h1) seq.push({ value: i + 1, color: "cyan" });
    if (i < h2) seq.push({ value: i + 1, color: "red" });
  }
  return seq;
}

function SchulteTableGame({ onComplete }: { onComplete: (tel: SchulteTelemetry) => Promise<void> }) {
  const { t } = useLang();
  const [size, setSize] = useState<SSize>(5);
  const [mode, setMode] = useState<SMode>("classic");
  const [grid, setGrid] = useState<SCell[]>(() => buildSchulteGrid(5, "classic"));
  const [sequence, setSequence] = useState(() => buildSchulteSeq(5, "classic"));
  const [seqIdx, setSeqIdx] = useState(0);
  const [foundSet, setFoundSet] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [flashCell, setFlashCell] = useState<{ idx: number; ok: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [showCenter, setShowCenter] = useState(true);
  const [hearts, setHearts] = useState(3);
  const MAX_HEARTS = 3;
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongClicksRef = useRef(0);
  const completedRef = useRef(false);
  // Per-find reaction times. The gap between consecutive correct hits is the
  // real signal here: total time alone can't tell a steady searcher apart from
  // someone who stalls once and then rushes.
  const hitRtsRef = useRef<number[]>([]);
  const lastHitRef = useRef<number | null>(null);

  const reset = useCallback((ns: SSize = size, nm: SMode = mode) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setGrid(buildSchulteGrid(ns, nm));
    setSequence(buildSchulteSeq(ns, nm));
    setSeqIdx(0);
    setFoundSet(new Set());
    setStatus("idle");
    setElapsed(0);
    setFlashCell(null);
    setHearts(MAX_HEARTS);
    wrongClicksRef.current = 0;
    completedRef.current = false;
    startRef.current = null;
    hitRtsRef.current = [];
    lastHitRef.current = null;
  }, [size, mode]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // Declarative win detection: the moment every number in the sequence has been
  // found we fire onComplete exactly once (guarded by completedRef). Running this
  // in an effect — rather than inside the click handler — means it can't be missed
  // due to stale closures or state-update batching, which is why rounds weren't saving.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    if (sequence.length === 0 || seqIdx < sequence.length) return;

    completedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = Date.now() - (startRef.current ?? Date.now());
    setElapsed(ms);
    setStatus("done");
    setBestTime((prev) => (prev === null || ms < prev ? ms : prev));
    setSaving(true);
    const modeLabel = `${size}×${size} ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    (async () => {
      try {
        await onComplete({
          timeMs: ms,
          cells: size * size,
          wrongClicks: wrongClicksRef.current,
          hitRts: [...hitRtsRef.current],
          modeLabel,
        });
      } catch (err) {
        console.error("Schulte completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [seqIdx, sequence.length, status, size, mode, onComplete]);

  const handleClick = useCallback(async (cell: SCell, idx: number) => {
    if (status === "done" || foundSet.has(idx)) return;
    if (status === "idle") {
      startRef.current = Date.now();
      lastHitRef.current = startRef.current;
      setStatus("playing");
      intervalRef.current = setInterval(() => setElapsed(Date.now() - (startRef.current ?? Date.now())), 50);
    }
    const target = sequence[seqIdx];
    const ok = cell.value === target.value && cell.color === target.color;
    setFlashCell({ idx, ok });
    setTimeout(() => setFlashCell(null), ok ? 260 : 380);
    if (!ok) {
      wrongClicksRef.current += 1;
      const newHearts = hearts - 1;
      setHearts(newHearts);
      if (newHearts <= 0) setTimeout(() => reset(), 420);
      return;
    }

    // Record how long this particular target took to locate.
    const now = Date.now();
    hitRtsRef.current.push(now - (lastHitRef.current ?? now));
    lastHitRef.current = now;

    // Advance state only — the completion effect above watches seqIdx and fires
    // onComplete once the final number is reached.
    const nf = new Set(foundSet); nf.add(idx);
    setFoundSet(nf);
    setSeqIdx(seqIdx + 1);
  }, [status, foundSet, sequence, seqIdx, hearts, reset]);

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const cs = Math.floor((ms % 1000) / 10);
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
      : `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const target = sequence[seqIdx];
  const progress = seqIdx / sequence.length;
  const SIZES: SSize[] = [3, 4, 5, 6];
  const MODES: { id: SMode; label: string; hint: string }[] = [
    { id: "classic", label: t.classic, hint: t.hint_classic(size * size) },
    { id: "reverse", label: t.reverse, hint: t.hint_reverse(size * size) },
    { id: "dual",    label: t.dual,    hint: t.hint_dual },
  ];

  return (
    <div className="rounded-2xl p-5 flex flex-col" style={{ background: "rgba(13,20,45,0.62)", border: "1px solid rgba(168,85,247,0.2)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 4px 44px rgba(0,0,0,0.45)" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#A855F7" }}>FOCUS TRAINING</div>
          <div className="text-base font-bold text-white">Schulte Table</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCenter(c => !c)}
            title="Toggle center fixation"
            className="px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 transition-all duration-150"
            style={{ fontFamily: "'JetBrains Mono', monospace", background: showCenter ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)", color: showCenter ? "#A855F7" : "#475569", border: `1px solid ${showCenter ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}` }}
          >
            <Focus size={11} /> {t.fixation}
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(168,85,247,0.18)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.28)" }}>
            <Focus size={16} />
          </div>
        </div>
      </div>

      {/* Size selector */}
      <div className="flex items-center gap-2.5 mt-3">
        <span className="text-[10px] text-slate-600 w-10 shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.size_label}</span>
        <div className="flex gap-1.5">
          {SIZES.map(s => {
            const active = size === s;
            return (
              <button
                key={s}
                onClick={() => { setSize(s); reset(s, mode); }}
                disabled={status === "playing"}
                className="rounded-lg text-[11px] font-bold px-2.5 py-1 transition-all duration-150 disabled:opacity-40"
                style={{ fontFamily: "'JetBrains Mono', monospace", background: active ? "rgba(168,85,247,0.22)" : "rgba(255,255,255,0.04)", color: active ? "#A855F7" : "#475569", border: active ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.07)", boxShadow: active ? "0 0 12px rgba(168,85,247,0.28)" : "none" }}
              >
                {s}×{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-2.5 mt-2">
        <span className="text-[10px] text-slate-600 w-10 shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.mode_label}</span>
        <div className="flex gap-1.5">
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); reset(size, m.id); }}
                disabled={status === "playing"}
                className="rounded-lg text-[11px] font-bold px-2.5 py-1 transition-all duration-150 disabled:opacity-40 flex items-center gap-1"
                style={{ fontFamily: "'JetBrains Mono', monospace", background: active ? "rgba(168,85,247,0.22)" : "rgba(255,255,255,0.04)", color: active ? "#A855F7" : "#475569", border: active ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.07)", boxShadow: active ? "0 0 12px rgba(168,85,247,0.28)" : "none" }}
              >
                {m.label}
                {active && <span style={{ fontSize: 9, opacity: 0.7 }}>{m.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Score badge + Hearts */}
      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)" }}
        >
          <Star size={11} style={{ color: "#A855F7" }} />
          <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#A855F7" }}>
            +{size === 3 ? 1 : size === 4 ? 2 : size === 5 ? 3 : 4} LOGIC
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <span
              key={i}
              style={{ fontSize: 14, opacity: i < hearts ? 1 : 0.2, transition: "opacity 0.25s", filter: i < hearts ? "drop-shadow(0 0 4px rgba(239,68,68,0.6))" : "none" }}
            >
              ❤️
            </span>
          ))}
        </div>
      </div>

      {/* Timer + "Find N" */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.time_label}</span>
          <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: status === "done" ? "#10B981" : "#A855F7", textShadow: status === "done" ? "0 0 24px rgba(16,185,129,0.5)" : "0 0 18px rgba(168,85,247,0.4)" }}>
            {fmtTime(elapsed)}
          </div>
          {bestTime !== null && (
            <span className="text-[9px] mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#475569" }}>
              {t.best_label} {fmtTime(bestTime)}
            </span>
          )}
        </div>

        {status !== "done" ? (
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{status === "idle" ? t.start_with_label : t.find_label}</span>
            <div className="flex items-center gap-2">
              {mode === "dual" && target && (
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: target.color === "red" ? "#F43F5E" : "#A855F7", boxShadow: `0 0 8px ${target.color === "red" ? "rgba(244,63,94,0.7)" : "rgba(168,85,247,0.7)"}` }}
                />
              )}
              <span
                className="text-4xl font-bold tabular-nums"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: target?.color === "red" ? "#F43F5E" : "#A855F7", textShadow: `0 0 20px ${target?.color === "red" ? "rgba(244,63,94,0.65)" : "rgba(168,85,247,0.65)"}` }}
              >
                {status === "idle" ? (mode === "reverse" ? size * size : "1") : (target?.value ?? "✓")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] text-emerald-400 flex items-center gap-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <CheckCircle size={13} /> {t.complete}
            </span>
            <span className="text-[10px] text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{size}×{size} · {mode}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-200" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #A855F7, #00D4FF)", boxShadow: "0 0 8px rgba(168,85,247,0.5)" }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-slate-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>0</span>
        <span className="text-[9px] text-slate-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{seqIdx} / {sequence.length}</span>
        <span className="text-[9px] text-slate-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sequence.length}</span>
      </div>

      {/* Grid */}
      <div
        className="mt-4 relative mx-auto w-full"
        style={{ display: "grid", gridTemplateColumns: `repeat(${size}, 1fr)`, gap: size >= 6 ? 4 : 5, maxWidth: size <= 3 ? 280 : size === 4 ? 340 : 420 }}
      >
        {/* Center fixation crosshair */}
        {showCenter && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div style={{ position: "relative", width: 24, height: 24 }}>
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(168,85,247,0.45)", transform: "translateY(-50%)" }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(168,85,247,0.45)", transform: "translateX(-50%)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 5, height: 5, borderRadius: "50%", background: "#A855F7", boxShadow: "0 0 10px rgba(168,85,247,0.9), 0 0 20px rgba(168,85,247,0.4)" }} />
            </div>
          </div>
        )}

        {grid.map((cell, idx) => {
          const isFlash = flashCell?.idx === idx;
          const isDone = foundSet.has(idx);
          const isRed = cell.color === "red";

          return (
            <button
              key={idx}
              onClick={() => handleClick(cell, idx)}
              disabled={status === "done" || isDone}
              className="rounded-xl font-bold flex items-center justify-center select-none transition-all duration-[120ms]"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                aspectRatio: "1",
                fontSize: size === 6 ? 12 : size === 3 ? 22 : size === 4 ? 18 : 15,
                background: isFlash
                  ? flashCell!.ok ? "rgba(16,185,129,0.32)" : "rgba(244,63,94,0.25)"
                  : isDone
                  ? "rgba(168,85,247,0.06)"
                  : "rgba(255,255,255,0.04)",
                color: isFlash
                  ? flashCell!.ok ? "#10B981" : "#F43F5E"
                  : isDone
                  ? "#10B981"
                  : isRed ? "#F97316" : "#e2e8f0",
                border: isFlash
                  ? `1px solid ${flashCell!.ok ? "rgba(16,185,129,0.55)" : "rgba(244,63,94,0.5)"}`
                  : isDone
                  ? "1px solid rgba(16,185,129,0.25)"
                  : isRed
                  ? "1px solid rgba(249,115,22,0.22)"
                  : "1px solid rgba(255,255,255,0.07)",
                boxShadow: isFlash && flashCell!.ok ? "0 0 18px rgba(16,185,129,0.42)" : isDone ? "0 0 8px rgba(16,185,129,0.12)" : undefined,
                transform: isFlash ? (flashCell!.ok ? "scale(0.88)" : "scale(0.96)") : "scale(1)",
                opacity: isDone ? 0.45 : 1,
                cursor: status === "done" || isDone ? "default" : "pointer",
              }}
            >
              {cell.value}
            </button>
          );
        })}
      </div>

      {/* Idle hint */}
      {status === "idle" && (
        <div className="mt-3 text-[11px] text-center text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {mode === "dual" ? t.idle_dual : mode === "reverse" ? t.idle_reverse(size * size) : t.idle_classic(size * size)}
        </div>
      )}

      {saving && (
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      <button
        disabled={saving}
        onClick={() => reset()}
        className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 hover:brightness-125"
        style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(168,85,247,0.14)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.25)" }}
      >
        <RefreshCw size={12} /> {t.new_game}
      </button>
    </div>
  );
}

// ─── Sudoku Game ───────────────────────────────────────────────────────────────

function SudokuGame({ onComplete }: { onComplete: (tel: SudokuTelemetry) => Promise<void> }) {
  const { t } = useLang();
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const level = SUDOKU_LEVELS.find((l) => l.id === difficulty)!;
  const [{ puzzle, solution }, setPuzzleData] = useState(() => generateSudoku(level.clues));
  const [userGrid, setUserGrid] = useState<(number | null)[][]>(() => puzzle.map((r) => [...r]));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const MAX_MISTAKES = 3;
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  // Working-memory signals. Overwriting a cell you already solved, or getting
  // the SAME cell wrong twice, means you lost track of your own deductions —
  // that is what the Memory axis measures here, independent of the clock.
  const placementsRef = useRef(0);
  const moveRtsRef = useRef<number[]>([]);
  const lastMoveRef = useRef<number | null>(null);
  const reEntriesRef = useRef(0);
  const repeatMistakesRef = useRef(0);
  const wrongCellsRef = useRef<Set<string>>(new Set());

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Build a fresh board for the given difficulty and reset all play state.
  const startBoard = useCallback((diff: Difficulty) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const lvl = SUDOKU_LEVELS.find((l) => l.id === diff)!;
    const nd = generateSudoku(lvl.clues);
    setPuzzleData(nd);
    setUserGrid(nd.puzzle.map((r) => [...r]));
    setSelected(null);
    setStatus("idle");
    setElapsed(0);
    setMistakes(0);
    completedRef.current = false;
    startRef.current = null;
    placementsRef.current = 0;
    moveRtsRef.current = [];
    lastMoveRef.current = null;
    reEntriesRef.current = 0;
    repeatMistakesRef.current = 0;
    wrongCellsRef.current = new Set();
  }, []);

  // Declarative win detection: fire onComplete once the board fully matches the
  // solution. Runs in an effect so it can't be skipped by stale closures.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    const solved = userGrid.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]));
    if (!solved) return;

    completedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const ms = Date.now() - (startRef.current ?? Date.now());
    setElapsed(ms);
    setStatus("done");
    setSaving(true);
    (async () => {
      try {
        await onComplete({
          timeMs: ms,
          difficulty,
          mistakes,
          placements: placementsRef.current,
          moveRts: [...moveRtsRef.current],
          reEntries: reEntriesRef.current,
          repeatMistakes: repeatMistakesRef.current,
        });
      } catch (err) {
        console.error("Sudoku completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [userGrid, solution, status, difficulty, mistakes, onComplete]);

  const reset = useCallback(() => startBoard(difficulty), [startBoard, difficulty]);

  // Changing difficulty immediately generates a new board at that level.
  const changeDifficulty = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    startBoard(diff);
  }, [startBoard]);

  const ensureStarted = useCallback(() => {
    if (status === "idle") {
      startRef.current = Date.now();
      lastMoveRef.current = startRef.current;
      setStatus("playing");
      timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current!), 500);
    }
  }, [status]);

  const inputNumber = useCallback(async (n: number) => {
    if (!selected || status === "done") return;
    const [r, c] = selected;
    if (puzzle[r][c] !== null) return;
    ensureStarted();

    const cellKey = `${r},${c}`;
    const now = Date.now();
    moveRtsRef.current.push(now - (lastMoveRef.current ?? now));
    lastMoveRef.current = now;

    const isWrong = n !== solution[r][c];
    if (isWrong) {
      // Same cell wrong more than once = the earlier elimination was forgotten.
      if (wrongCellsRef.current.has(cellKey)) repeatMistakesRef.current += 1;
      else wrongCellsRef.current.add(cellKey);
      const next = mistakes + 1;
      setMistakes(next);
      const ng = userGrid.map((row) => [...row]);
      ng[r][c] = n;
      setUserGrid(ng);
      setTimeout(() => {
        setUserGrid((prev) => prev.map((row, ri) => row.map((v, ci) => (ri === r && ci === c ? null : v))));
        if (next >= MAX_MISTAKES) reset();
      }, 600);
      return;
    }

    // Re-entry: this cell was already correctly filled and is being rewritten.
    if (userGrid[r][c] === solution[r][c]) reEntriesRef.current += 1;
    placementsRef.current += 1;

    // Place the digit — the completion effect watches userGrid and fires
    // onComplete once the whole board matches the solution.
    const ng = userGrid.map((row) => [...row]);
    ng[r][c] = n;
    setUserGrid(ng);
  }, [selected, status, puzzle, userGrid, solution, mistakes, ensureStarted, reset]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9) inputNumber(n);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inputNumber]);

  // Count only correctly placed digits (wrong entries don't consume a number)
  const counts = Array.from({ length: 9 }, (_, i) =>
    userGrid.reduce((sum, row, r) => sum + row.filter((v, c) => v === i + 1 && v === solution[r][c]).length, 0)
  );

  const getHighlight = (r: number, c: number): "selected" | "samenum" | "peer" | "none" => {
    if (!selected) return "none";
    const [sr, sc] = selected;
    if (r === sr && c === sc) return "selected";
    const selVal = userGrid[sr][sc];
    if (selVal !== null && userGrid[r][c] === selVal) return "samenum";
    if (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3))) return "peer";
    return "none";
  };

  const isErr = (r: number, c: number) => {
    const v = userGrid[r][c];
    return v !== null && puzzle[r][c] === null && v !== solution[r][c];
  };

  const p2 = (n: number) => String(n).padStart(2, "0");
  const fmtTime = (ms: number) => { const s = Math.floor(ms / 1000); return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: "rgba(13,20,45,0.62)", border: "1px solid rgba(0,212,255,0.2)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 4px 44px rgba(0,0,0,0.45)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#00D4FF" }}>LOGIC TRAINING</div>
          <div className="text-base font-bold text-white">Sudoku</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: status === "done" ? "#10B981" : "#00D4FF" }}>
            {fmtTime(elapsed)}
          </div>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(0,212,255,0.18)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.28)" }}>
            <Grid3X3 size={16} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace", background: `${level.accent}22`, color: level.accent, border: `1px solid ${level.accent}44` }}>{level.clues} {t.clues}</span>
        <span className="text-[10px] flex items-center gap-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: level.accent }}><Star size={10} />+{level.points} LOGIC</span>
        {/* Mistake hearts */}
        <div className="flex items-center gap-0.5 ml-1">
          {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
            <span key={i} style={{ fontSize: 12, opacity: i < mistakes ? 0.25 : 1, transition: "opacity 0.3s" }}>❤️</span>
          ))}
        </div>
        {status === "done" && <span className="text-[10px] text-emerald-400 ml-auto flex items-center gap-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}><CheckCircle size={10} /> {t.solved}</span>}
      </div>

      {/* ── Difficulty selector ── */}
      <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {SUDOKU_LEVELS.map((l) => {
          const isActive = l.id === difficulty;
          return (
            <button
              key={l.id}
              onClick={() => changeDifficulty(l.id)}
              disabled={saving}
              className="rounded-lg py-1.5 text-[10px] font-bold tracking-wide transition-all duration-150 disabled:opacity-50"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: isActive ? `${l.accent}22` : "rgba(255,255,255,0.03)",
                color: isActive ? l.accent : "#64748b",
                border: isActive ? `1px solid ${l.accent}66` : "1px solid rgba(255,255,255,0.06)",
                boxShadow: isActive ? `0 0 14px ${l.accent}33` : "none",
              }}
            >
              {t[l.id as keyof typeof t] as string ?? l.id}
            </button>
          );
        })}
      </div>

      {/* ── Grid: 3×3 outer (boxes) → 3×3 inner (cells) ── */}
      {/* Bright glowing gutter between the 9 boxes; subtle hairlines within each box. */}
      <div
        className="mt-4 mx-auto w-full max-w-[420px]"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 5,
          padding: 5,
          background: "rgba(0,212,255,0.55)",
          borderRadius: 12,
          border: "1px solid rgba(0,212,255,0.6)",
          boxShadow: "0 0 26px rgba(0,212,255,0.28), inset 0 0 18px rgba(0,212,255,0.12)",
        }}
      >
        {([0, 1, 2] as const).map((boxRow) =>
          ([0, 1, 2] as const).map((boxCol) => (
            <div
              key={`box-${boxRow}-${boxCol}`}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 2,
                background: "rgba(0,212,255,0.14)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              {([0, 1, 2] as const).map((cr) =>
                ([0, 1, 2] as const).map((cc) => {
                  const r = boxRow * 3 + cr;
                  const c = boxCol * 3 + cc;
                  const isGiven = puzzle[r][c] !== null;
                  const val = userGrid[r][c];
                  const err = isErr(r, c);
                  const hl = getHighlight(r, c);
                  const isSel = hl === "selected";

                  // Crisp cell backgrounds — givens sit on a darker slate, empty
                  // cells a touch lighter so they read as "fillable".
                  let bg = isGiven ? "rgba(6,11,26,0.96)" : "rgba(14,22,46,0.96)";
                  if (hl === "peer") bg = "rgba(0,212,255,0.09)";
                  else if (hl === "samenum") bg = "rgba(0,212,255,0.2)";
                  if (isSel) bg = "rgba(0,180,255,0.3)";
                  if (err) bg = "rgba(244,63,94,0.22)";

                  // Pre-filled = bold white; user-entered = bright cyan.
                  let textColor = isGiven ? "#f1f5f9" : err ? "#F43F5E" : "#38E1FF";
                  if (status === "done" && !isGiven) textColor = "#10B981";

                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => { if (status !== "done") setSelected([r, c]); }}
                      style={{
                        aspectRatio: "1",
                        background: bg,
                        color: textColor,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: isGiven ? 800 : 600,
                        fontSize: 15,
                        cursor: isGiven ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: isSel
                          ? "2px solid rgba(56,225,255,1)"
                          : err
                          ? "1.5px solid rgba(244,63,94,0.7)"
                          : "1px solid transparent",
                        transition: "background 0.1s, border-color 0.1s",
                        boxShadow: isSel ? "inset 0 0 14px rgba(0,212,255,0.4)" : "none",
                        textShadow: !isGiven && val ? "0 0 8px rgba(56,225,255,0.5)" : "none",
                        padding: 0,
                      }}
                    >
                      {val ?? ""}
                    </button>
                  );
                })
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Number pad ── */}
      <div className="mt-5 mx-auto w-full max-w-[420px] grid grid-cols-9 gap-1.5">
        {Array.from({ length: 9 }, (_, i) => {
          const n = i + 1;
          const cnt = counts[i];
          const done = cnt >= 9;
          const remaining = 9 - cnt;
          return (
            <button
              key={n}
              onClick={() => inputNumber(n)}
              disabled={status === "done" || done}
              className="rounded-xl flex flex-col items-center justify-center py-2 transition-all duration-100 hover:brightness-125 disabled:opacity-25 disabled:hover:brightness-100"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: "rgba(0,212,255,0.1)",
                color: "#38E1FF",
                border: "1px solid rgba(0,212,255,0.25)",
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1,
                gap: 3,
              }}
            >
              {n}
              <span style={{ fontSize: 9, opacity: 0.55, lineHeight: 1 }}>{remaining}</span>
            </button>
          );
        })}
      </div>

      {/* ── New game ── */}
      <button
        onClick={reset}
        disabled={saving}
        className="mt-2.5 mx-auto w-full max-w-[420px] rounded-xl flex items-center justify-center gap-2 py-2.5 transition-all duration-100 hover:brightness-125 disabled:opacity-40"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          background: "rgba(0,212,255,0.08)",
          color: "#00D4FF",
          border: "1px solid rgba(0,212,255,0.22)",
          fontSize: 11,
          letterSpacing: "0.15em",
        }}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {t.new_puzzle}
      </button>
    </div>
  );
}


// ─── Stroop Test ──────────────────────────────────────────────────────────────

const STROOP_COLORS = [
  { id: "red",    hex: "#F43F5E" },
  { id: "blue",   hex: "#3B82F6" },
  { id: "green",  hex: "#10B981" },
  { id: "yellow", hex: "#EAB308" },
  { id: "purple", hex: "#A855F7" },
  { id: "orange", hex: "#F97316" },
] as const;

type StroopColorId = (typeof STROOP_COLORS)[number]["id"];

interface Stimulus {
  wordId: StroopColorId;  // the word displayed
  inkId:  StroopColorId;  // the actual ink color
  options: StroopColorId[]; // 4 answer choices (always includes inkId)
}

function makeStimulus(prevInkId?: StroopColorId): Stimulus {
  const ids = STROOP_COLORS.map(c => c.id) as StroopColorId[];
  // always incongruent: ink ≠ word
  const wordId = ids[Math.floor(Math.random() * ids.length)];
  let inkCandidates = ids.filter(id => id !== wordId);
  if (prevInkId) inkCandidates = inkCandidates.filter(id => id !== prevInkId); // avoid back-to-back same ink
  if (!inkCandidates.length) inkCandidates = ids.filter(id => id !== wordId);
  const inkId = inkCandidates[Math.floor(Math.random() * inkCandidates.length)];

  // 4 random options including inkId
  const others = shuffleArray(ids.filter(id => id !== inkId)).slice(0, 3);
  const options = shuffleArray([inkId, ...others]);
  return { wordId, inkId, options };
}

function StroopGame({ onComplete }: { onComplete: (tel: StroopTelemetry) => Promise<void> }) {
  const { t, lang } = useLang();
  const TOTAL = 20;
  const MAX_HEARTS = 3;

  const colorLabel = (id: StroopColorId): string =>
    t[`color_${id}` as keyof typeof t] as string ?? id.toUpperCase();
  const colorHex = (id: StroopColorId): string =>
    STROOP_COLORS.find(c => c.id === id)!.hex;

  const [stimulus, setStimulus] = useState<Stimulus>(() => makeStimulus());
  const [trialsLeft, setTrialsLeft] = useState(TOTAL);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
  const [saving, setSaving] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const wrongRef = useRef(0);
  // Per-trial reaction times. Stroop interference shows up in the RT spread,
  // not in the total — so Focus reads consistency while Speed reads the median.
  const rtsRef = useRef<number[]>([]);
  const lastTrialRef = useRef<number | null>(null);
  const prevInkRef = useRef<StroopColorId | undefined>(undefined);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    wrongRef.current = 0;
    rtsRef.current = [];
    lastTrialRef.current = null;
    prevInkRef.current = undefined;
    completedRef.current = false;
    setStimulus(makeStimulus());
    setTrialsLeft(TOTAL);
    setHearts(MAX_HEARTS);
    setStatus("idle");
    setElapsed(0);
    setFlash(null);
    startRef.current = null;
  };

  // Declarative end-of-round: fires onComplete exactly once when the run ends —
  // either all trials cleared or hearts exhausted. Running in an effect means it
  // can't be dropped by a stale closure inside the flash setTimeout callbacks.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    if (trialsLeft > 0 && hearts > 0) return;

    completedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = Date.now() - (startRef.current ?? Date.now());
    setElapsed(ms);
    setStatus("done");
    setBestTime((prev) => (prev === null || ms < prev ? ms : prev));
    setSaving(true);
    (async () => {
      try {
        await onComplete({
          timeMs: ms,
          totalStimuli: TOTAL,
          wrongClicks: wrongRef.current,
          rts: [...rtsRef.current],
        });
      } catch (err) {
        console.error("Stroop completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [trialsLeft, hearts, status, onComplete]);

  const handleAnswer = useCallback(async (chosen: StroopColorId) => {
    if (status === "done" || flash !== null) return;

    if (status === "idle") {
      startRef.current = Date.now();
      lastTrialRef.current = startRef.current;
      setStatus("playing");
      intervalRef.current = setInterval(() => setElapsed(Date.now() - (startRef.current ?? Date.now())), 50);
    }

    const now = Date.now();
    const rt = now - (lastTrialRef.current ?? now);
    lastTrialRef.current = now;

    const correct = chosen === stimulus.inkId;
    setFlash(correct ? "correct" : "wrong");

    if (!correct) {
      // Losing the last heart drops hearts to 0 — the completion effect ends the run.
      wrongRef.current += 1;
      const nh = hearts - 1;
      setHearts(nh);
      setTimeout(() => {
        setFlash(null);
        if (nh > 0) setStimulus(makeStimulus(prevInkRef.current)); // retry same on wrong
      }, 420);
      return;
    }

    // Only correct responses feed the RT distribution — mixing in error trials
    // would let fast wrong guesses masquerade as fast processing.
    rtsRef.current.push(rt);

    // Clearing the last trial drops trialsLeft to 0 — the completion effect ends the run.
    prevInkRef.current = stimulus.inkId;
    const newLeft = trialsLeft - 1;
    setTrialsLeft(newLeft);
    setTimeout(() => {
      setFlash(null);
      if (newLeft > 0) setStimulus(makeStimulus(stimulus.inkId));
    }, 240);
  }, [status, flash, stimulus, hearts, trialsLeft]);

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const progress = (TOTAL - trialsLeft) / TOTAL;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: "rgba(13,20,45,0.62)", border: "1px solid rgba(234,179,8,0.2)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 4px 44px rgba(0,0,0,0.45)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#EAB308" }}>{t.stroop_tag}</div>
          <div className="text-base font-bold text-white">Stroop Test</div>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(234,179,8,0.18)", color: "#EAB308", border: "1px solid rgba(234,179,8,0.28)" }}>
          <Zap size={16} />
        </div>
      </div>

      {/* Score badge + hearts */}
      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.25)" }}>
          <Star size={11} style={{ color: "#EAB308" }} />
          <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#EAB308" }}>+2 {t.stroop_inhibition.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <span key={i} style={{ fontSize: 14, opacity: i < hearts ? 1 : 0.2, transition: "opacity 0.25s", filter: i < hearts ? "drop-shadow(0 0 4px rgba(239,68,68,0.6))" : "none" }}>❤️</span>
          ))}
        </div>
      </div>

      {/* Timer row */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.time_label}</span>
          <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: status === "done" ? "#10B981" : "#EAB308", textShadow: status === "done" ? "0 0 24px rgba(16,185,129,0.5)" : "0 0 18px rgba(234,179,8,0.4)" }}>
            {fmtTime(elapsed)}
          </div>
          {bestTime !== null && (
            <span className="text-[9px] mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#475569" }}>{t.best_label} {fmtTime(bestTime)}</span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.stroop_trial}</span>
          <span className="text-4xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#EAB308", textShadow: "0 0 20px rgba(234,179,8,0.55)" }}>
            {TOTAL - trialsLeft + (status === "done" ? 0 : 0)}/{TOTAL}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-200" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #EAB308, #F97316)", boxShadow: "0 0 8px rgba(234,179,8,0.5)" }} />
      </div>

      {/* Instruction label */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.stroop_instruction}</span>
        <span className="text-[10px] text-slate-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.stroop_hint}</span>
      </div>

      {/* ── Stimulus area ── */}
      <div
        className="mt-1.5 relative flex items-center justify-center rounded-2xl select-none"
        style={{
          minHeight: 120,
          background: flash === "correct"
            ? "rgba(16,185,129,0.08)"
            : flash === "wrong"
            ? "rgba(244,63,94,0.08)"
            : "rgba(0,0,0,0.22)",
          border: flash === "correct"
            ? "1px solid rgba(16,185,129,0.4)"
            : flash === "wrong"
            ? "1px solid rgba(244,63,94,0.4)"
            : "1px solid rgba(255,255,255,0.06)",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {status === "done" ? (
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold py-10" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <CheckCircle size={16} /> {t.stroop_complete}
          </div>
        ) : (
          <div className="py-8 px-6 flex flex-col items-center gap-2">
            {/* The word, rendered in its INK color — always visible */}
            <span
              className="font-black tracking-[0.15em] select-none"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 52,
                color: colorHex(stimulus.inkId),
                textShadow: `0 0 28px ${colorHex(stimulus.inkId)}99`,
                transition: "color 0.12s",
                filter: flash ? `brightness(${flash === "correct" ? 1.6 : 0.8})` : "none",
              }}
            >
              {colorLabel(stimulus.wordId)}
            </span>
          </div>
        )}
      </div>

      {/* ── Color choice buttons ── */}
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {stimulus.options.map((cid) => {
          const hex = colorHex(cid);
          const isCorrect = flash === "correct" && cid === stimulus.inkId;
          const isWrong   = flash === "wrong";
          return (
            <button
              key={cid}
              onClick={() => { if (status !== "done") handleAnswer(cid); }}
              disabled={flash !== null || status === "done"}
              className="rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-60"
              style={{
                padding: "10px 6px",
                background: isCorrect
                  ? `${hex}44`
                  : isWrong && cid === stimulus?.inkId
                  ? `${hex}33`
                  : `${hex}18`,
                border: `1.5px solid ${hex}${isCorrect ? "cc" : "55"}`,
                boxShadow: isCorrect ? `0 0 18px ${hex}66` : "none",
                transform: isCorrect ? "scale(0.95)" : "scale(1)",
              }}
            >
              <div className="w-5 h-5 rounded-full" style={{ background: hex, boxShadow: `0 0 8px ${hex}88` }} />
              <span className="text-[9px] font-bold tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: hex }}>
                {colorLabel(cid)}
              </span>
            </button>
          );
        })}
      </div>


      {saving && (
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      <button
        disabled={saving}
        onClick={reset}
        className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 hover:brightness-125"
        style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(234,179,8,0.14)", color: "#EAB308", border: "1px solid rgba(234,179,8,0.25)" }}
      >
        <RefreshCw size={12} /> {t.new_game}
      </button>
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function GlassCard({ children, className = "", accent = "#00D4FF" }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: "rgba(13,20,45,0.62)", border: `1px solid ${accent}18`, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 4px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {children}
    </div>
  );
}

function GameTile({ accent, icon, tag, title, desc, playLabel, onPlay }: { accent: string; icon: React.ReactNode; tag: string; title: string; desc: string; playLabel?: string; onPlay: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onPlay}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="text-left rounded-2xl p-6 flex flex-col transition-all duration-200"
      style={{
        background: "rgba(13,20,45,0.62)",
        border: `1px solid ${accent}${hover ? "55" : "22"}`,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: hover ? `0 0 34px ${accent}33` : "0 4px 44px rgba(0,0,0,0.45)",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
          {icon}
        </div>
        <ChevronRight size={18} style={{ color: accent, transform: hover ? "translateX(3px)" : "none", transition: "transform 0.2s" }} />
      </div>
      <div className="text-[10px] tracking-[0.2em] mt-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}>{tag}</div>
      <div className="text-lg font-bold text-white mt-1">{title}</div>
      <div className="text-xs text-slate-400 mt-2 leading-relaxed">{desc}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}>
        <Zap size={12} /> {playLabel ?? "PLAY NOW"}
      </div>
    </button>
  );
}

// ─── Round Result Overlay ──────────────────────────────────────────────────────

function RoundResultOverlay({ result, onClose }: { result: RoundResult; onClose: () => void }) {
  const { t } = useLang();
  const isSchulte = result.game === "schulte";
  const isStroop  = result.game === "stroop";
  const accent = isSchulte ? "#A855F7" : isStroop ? "#EAB308" : "#00D4FF";
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const cs = Math.floor((ms % 1000) / 10);
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
      : `${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,10,24,0.88)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5"
        style={{ background: "rgba(13,20,45,0.95)", border: `1px solid ${accent}33`, boxShadow: `0 0 60px ${accent}22, 0 8px 48px rgba(0,0,0,0.6)` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}>
              {isSchulte ? "SCHULTE TABLE" : isStroop ? "STROOP TEST" : "SUDOKU"} · {t.round_complete}
            </div>
            <div className="text-xl font-bold text-white">{result.label}</div>
          </div>
          <div className="flex flex-col items-end gap-0.5 px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <span className="text-[8px] tracking-[0.15em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,158,11,0.7)" }}>{t.round_score_label}</span>
            <div className="flex items-center gap-1.5">
              <Star size={11} style={{ color: "#F59E0B" }} />
              <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F59E0B" }}>{result.headline} / {RATING_MAX}</span>
            </div>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Clock size={14} style={{ color: accent }} />
          <span className="text-[11px] text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>TIME</span>
          <span className="ml-auto text-xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: accent }}>{fmtTime(result.timeMs)}</span>
        </div>

        {/* Domain scores */}
        <div className="flex flex-col gap-3">
          <div className="text-[10px] text-slate-600 tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.current_rating_label} · {t.domains_this_round}</div>
          {/* Only the axes this game measures appear here, each with its own
              round score — so it's visible that they no longer move in lockstep. */}
          {result.rows.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.label.toUpperCase()}</span>
                <span className="text-sm font-bold tabular-nums text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.next} / {RATING_MAX}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(s.next / RATING_MAX) * 100}%`, background: s.color, boxShadow: `0 0 8px ${s.color}88`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}
                />
              </div>
              <div className="text-[9px] text-slate-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {t.round_axis_detail(s.round, s.next > s.prev ? s.next - s.prev : 0)}
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="text-[10px] text-slate-600 text-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {t.score_note}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold tracking-widest transition-all duration-150 hover:brightness-125"
          style={{ fontFamily: "'JetBrains Mono', monospace", background: `${accent}20`, color: accent, border: `1px solid ${accent}44`, boxShadow: `0 0 20px ${accent}18` }}
        >
          {t.continue_btn}
        </button>
      </div>
    </div>
  );
}

function Label({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="text-[11px] tracking-[0.2em] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>
      {children}
    </div>
  );
}

function StatMini({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-600 mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label.toUpperCase()}</div>
      <div className="text-xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div className="text-[10px] mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>{unit}</div>
    </div>
  );
}
// ─── Memory Matrix Game ──────────────────────────────────────────────────────

function MemoryMatrixGame({ onComplete }: { onComplete: (tel: MemoryTelemetry) => Promise<void> }) {
  const { t } = useLang();
  const MAX_HEARTS = 3;
  
  const [level, setLevel] = useState(1);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [status, setStatus] = useState<"idle" | "memorize" | "recall" | "success" | "fail" | "done">("idle");
  const [targets, setTargets] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [wrongClicks, setWrongClicks] = useState(0);
  
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gridSize = Math.min(6, Math.max(3, Math.floor(2 + level / 3)));
  const targetCount = Math.min(15, 2 + Math.floor(level / 1.5));
  const totalCells = gridSize * gridSize;

  const generateLevel = useCallback(() => {
    const newTargets = shuffleArray(Array.from({ length: totalCells }, (_, i) => i)).slice(0, targetCount);
    setTargets(newTargets);
    setSelected([]);
    setStatus("memorize");
    
    if (level === 1 && !startRef.current) {
      startRef.current = Date.now();
      intervalRef.current = setInterval(() => setElapsed(Date.now() - (startRef.current ?? Date.now())), 100);
    }

    setTimeout(() => {
      setStatus(prev => prev === "memorize" ? "recall" : prev);
    }, 1500 + targetCount * 100);
  }, [level, targetCount, totalCells]);

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLevel(1);
    setHearts(MAX_HEARTS);
    setStatus("idle");
    setElapsed(0);
    setWrongClicks(0);
    startRef.current = null;
  };

  const handleCellClick = (idx: number) => {
    if (status !== "recall" || selected.includes(idx)) return;

    const newSelected = [...selected, idx];
    setSelected(newSelected);

    if (!targets.includes(idx)) {
      setWrongClicks(prev => prev + 1);
      const newHearts = hearts - 1;
      setHearts(newHearts);
      setStatus("fail");
      
      if (newHearts <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => {
          setStatus("done");
          setSaving(true);
          onComplete({
            timeMs: Date.now() - (startRef.current ?? Date.now()),
            maxLevel: level,
            wrongClicks: wrongClicks + 1,
          }).finally(() => setSaving(false));
        }, 1000);
      } else {
        setTimeout(() => {
          generateLevel();
        }, 1000);
      }
      return;
    }

    if (newSelected.length === targets.length) {
      setStatus("success");
      setTimeout(() => {
        setLevel(l => l + 1);
      }, 600);
    }
  };

  useEffect(() => {
    if (level > 1) {
      generateLevel();
    }
  }, [level, generateLevel]);

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{ background: "rgba(13,20,45,0.62)", border: "1px solid rgba(244,63,94,0.2)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 4px 44px rgba(0,0,0,0.45)" }}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F43F5E" }}>MEMORY TRAINING</div>
          <div className="text-base font-bold text-white">Memory Matrix</div>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(244,63,94,0.18)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.28)" }}>
          <Brain size={16} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)" }}>
          <Star size={11} style={{ color: "#F43F5E" }} />
          <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F43F5E" }}>+{level} MEMORY</span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <span key={i} style={{ fontSize: 14, opacity: i < hearts ? 1 : 0.2, transition: "opacity 0.25s", filter: i < hearts ? "drop-shadow(0 0 4px rgba(239,68,68,0.6))" : "none" }}>❤️</span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>TIME</span>
          <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: status === "done" ? "#10B981" : "#F43F5E", textShadow: status === "done" ? "0 0 24px rgba(16,185,129,0.5)" : "0 0 18px rgba(244,63,94,0.4)" }}>
            {fmtTime(elapsed)}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-600 mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>LEVEL</span>
          <span className="text-4xl font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F43F5E", textShadow: "0 0 20px rgba(244,63,94,0.55)" }}>
            {level}
          </span>
        </div>
      </div>

      {status === "idle" ? (
        <div className="mt-6 flex flex-col items-center justify-center py-10" style={{ minHeight: 280 }}>
          <div className="text-sm text-slate-400 text-center mb-6 leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Ghi nhớ vị trí các ô phát sáng.<br />Khi chúng tắt, hãy chọn lại chính xác.
          </div>
          <button
            onClick={generateLevel}
            className="px-8 py-3 rounded-xl text-sm font-bold tracking-widest transition-all duration-200 hover:scale-105"
            style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(244,63,94,0.15)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.4)", boxShadow: "0 0 20px rgba(244,63,94,0.2)" }}
          >
            START MATRIX
          </button>
        </div>
      ) : status === "done" ? (
        <div className="mt-6 flex flex-col items-center justify-center py-10" style={{ minHeight: 280 }}>
          <CheckCircle size={48} className="text-emerald-400 mb-4" />
          <div className="text-lg font-bold text-white mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>GAME OVER</div>
          <div className="text-sm text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Max Level: <span className="text-[#F43F5E]">{level}</span></div>
        </div>
      ) : (
        <div className="mt-6 mx-auto relative" style={{ width: "100%", maxWidth: 320 }}>
          <div 
            style={{ 
              display: "grid", 
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`, 
              gap: 8,
              aspectRatio: "1",
              pointerEvents: status === "recall" ? "auto" : "none"
            }}
          >
            {Array.from({ length: totalCells }).map((_, idx) => {
              const isTarget = targets.includes(idx);
              const isSelected = selected.includes(idx);
              const isWrong = isSelected && !isTarget;
              
              let bg = "rgba(255,255,255,0.03)";
              let border = "1px solid rgba(255,255,255,0.06)";
              let shadow = "none";
              let transform = "scale(1)";

              if ((status === "memorize" || status === "fail") && isTarget) {
                bg = "rgba(244,63,94,0.8)";
                border = "1px solid rgba(244,63,94,1)";
                shadow = "0 0 15px rgba(244,63,94,0.6)";
              } else if (status === "recall" || status === "success") {
                if (isWrong) {
                  bg = "rgba(239,68,68,0.4)";
                  border = "1px solid rgba(239,68,68,0.8)";
                } else if (isSelected) {
                  bg = "rgba(16,185,129,0.5)";
                  border = "1px solid rgba(16,185,129,0.8)";
                  shadow = "0 0 10px rgba(16,185,129,0.4)";
                  transform = "scale(0.92)";
                } else {
                  bg = "rgba(255,255,255,0.05)";
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleCellClick(idx)}
                  className="rounded-lg transition-all duration-200"
                  style={{
                    background: bg,
                    border: border,
                    boxShadow: shadow,
                    transform: transform,
                    cursor: status === "recall" && !isSelected ? "pointer" : "default"
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      {status !== "idle" && (
        <button
          disabled={saving}
          onClick={reset}
          className="mt-6 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-125"
          style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(244,63,94,0.1)", color: "#F43F5E", border: "1px solid rgba(244,63,94,0.25)" }}
        >
          <RefreshCw size={12} /> ABORT & RESTART
        </button>
      )}
    </div>
  );
}
// ─── Reaction Time Game ─────────────────────────────────────────────────────

function ReactionTimeGame({
  onComplete,
}: {
  onComplete: (tel: ReactionTelemetry) => Promise<void>;
}) {
  const TOTAL_TRIALS = 5;

  type ReactionPhase =
    | "idle"
    | "waiting"
    | "ready"
    | "result"
    | "done";

  const [phase, setPhase] = useState<ReactionPhase>("idle");
  const [rts, setRts] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [currentRt, setCurrentRt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const readyAtRef = useRef(0);
  const falseStartsRef = useRef(0);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const scheduleTrial = useCallback(() => {
    clearTimers();
    setPhase("waiting");
    setCurrentRt(null);
    setMessage("Chờ tín hiệu chuyển xanh...");

    const delay = 1500 + Math.random() * 2500;

    waitTimerRef.current = setTimeout(() => {
      readyAtRef.current = performance.now();
      setPhase("ready");
      setMessage("BẤM NGAY!");
    }, delay);
  }, [clearTimers]);

  const startGame = () => {
    clearTimers();
    setRts([]);
    setFalseStarts(0);
    falseStartsRef.current = 0;
    setCurrentRt(null);
    scheduleTrial();
  };

  const finishGame = async (completedRts: number[]) => {
    clearTimers();
    setPhase("done");
    setSaving(true);

    try {
      await onComplete({
        timeMs: completedRts.reduce((sum, rt) => sum + rt, 0),
        rts: completedRts,
        falseStarts: falseStartsRef.current,
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePadClick = () => {
    if (phase === "waiting") {
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }

      const newFalseStarts = falseStartsRef.current + 1;
      falseStartsRef.current = newFalseStarts;
      setFalseStarts(newFalseStarts);
      setPhase("result");
      setMessage("BẤM QUÁ SỚM!");

      nextTimerRef.current = setTimeout(scheduleTrial, 900);
      return;
    }

    if (phase !== "ready") return;

    const reactionMs = Math.max(
      1,
      Math.round(performance.now() - readyAtRef.current),
    );

    const completedRts = [...rts, reactionMs];

    setRts(completedRts);
    setCurrentRt(reactionMs);
    setPhase("result");
    setMessage(`${reactionMs} ms`);

    if (completedRts.length >= TOTAL_TRIALS) {
      nextTimerRef.current = setTimeout(() => {
        finishGame(completedRts);
      }, 800);
    } else {
      nextTimerRef.current = setTimeout(scheduleTrial, 1000);
    }
  };

  const resetGame = () => {
    clearTimers();
    setPhase("idle");
    setRts([]);
    setFalseStarts(0);
    falseStartsRef.current = 0;
    setCurrentRt(null);
    setMessage("");
  };

  const average =
    rts.length > 0
      ? Math.round(rts.reduce((sum, rt) => sum + rt, 0) / rts.length)
      : 0;

  const padBackground =
    phase === "ready"
      ? "rgba(16,185,129,0.85)"
      : phase === "result" && currentRt === null
        ? "rgba(244,63,94,0.35)"
        : "rgba(13,20,45,0.8)";

  const padBorder =
    phase === "ready"
      ? "1px solid rgba(16,185,129,1)"
      : phase === "result" && currentRt === null
        ? "1px solid rgba(244,63,94,0.8)"
        : "1px solid rgba(16,185,129,0.25)";

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(13,20,45,0.62)",
        border: "1px solid rgba(16,185,129,0.2)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-[10px] tracking-[0.2em] mb-1.5"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "#10B981",
            }}
          >
            SPEED TRAINING
          </div>

          <div className="text-base font-bold text-white">
            Reaction Time
          </div>
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(16,185,129,0.18)",
            color: "#10B981",
            border: "1px solid rgba(16,185,129,0.28)",
          }}
        >
          <Activity size={17} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center">
          <div className="text-[9px] text-slate-500">TRIAL</div>
          <div className="text-lg font-bold text-white">
            {Math.min(rts.length + 1, TOTAL_TRIALS)}/{TOTAL_TRIALS}
          </div>
        </div>

        <div className="text-center">
          <div className="text-[9px] text-slate-500">AVERAGE</div>
          <div className="text-lg font-bold text-[#10B981]">
            {average || "--"} ms
          </div>
        </div>

        <div className="text-center">
          <div className="text-[9px] text-slate-500">TOO SOON</div>
          <div className="text-lg font-bold text-[#F43F5E]">
            {falseStarts}
          </div>
        </div>
      </div>

      {phase === "idle" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <Clock size={46} className="text-[#10B981] mb-5" />

          <p className="text-sm text-slate-400 text-center leading-relaxed">
            Chờ màn hình chuyển sang màu xanh,
            <br />
            sau đó bấm nhanh nhất có thể.
          </p>

          <button
            onClick={startGame}
            className="mt-6 px-8 py-3 rounded-xl text-sm font-bold tracking-widest hover:scale-105 transition-all"
            style={{
              background: "rgba(16,185,129,0.15)",
              color: "#10B981",
              border: "1px solid rgba(16,185,129,0.4)",
            }}
          >
            START TEST
          </button>
        </div>
      ) : phase === "done" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <CheckCircle size={48} className="text-emerald-400 mb-4" />

          <div className="text-lg font-bold text-white">
            TEST COMPLETE
          </div>

          <div className="mt-2 text-4xl font-bold text-[#10B981]">
            {average} ms
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Average reaction time
          </div>
        </div>
      ) : (
        <button
          onClick={handlePadClick}
          className={`mt-6 rounded-2xl flex flex-col items-center justify-center transition-all ${
            phase === "ready" ? "animate-pulse" : ""
          }`}
          style={{
            minHeight: 280,
            background: padBackground,
            border: padBorder,
            boxShadow:
              phase === "ready"
                ? "0 0 40px rgba(16,185,129,0.45)"
                : "none",
          }}
        >
          <div
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {message}
          </div>

          {phase === "waiting" && (
            <div className="mt-3 text-xs text-slate-500">
              Không bấm trước khi màn hình chuyển xanh
            </div>
          )}
        </button>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          Đang lưu kết quả...
        </div>
      )}

      {phase !== "idle" && (
        <button
          disabled={saving}
          onClick={resetGame}
          className="mt-5 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2"
          style={{
            background: "rgba(16,185,129,0.1)",
            color: "#10B981",
            border: "1px solid rgba(16,185,129,0.25)",
          }}
        >
          <RefreshCw size={12} />
          RESTART TEST
        </button>
      )}
    </div>
  );
}