--- a/src/app/App.tsx
+++ b/src/app/App.tsx
@@ -31,11 +31,30 @@
   fetchProfile,
   handleLogout,
   saveScores,
+  saveBirthYear,
   recordDailyActivity,
+  fetchPopulationStats,
   cognitiveIndex,
-  RATING_MAX,
   type Profile,
 } from "./lib/api";
+import {
+  RATING_MAX,
+  sanitizeRating,
+  pullUpRating,
+  scoreSchulte,
+  scoreSudoku,
+  scoreStroop,
+  calcBrainAge,
+  roundHeadline,
+  SUDOKU_DIFF_FACTOR,
+  CALIBRATION_ROUNDS,
+  DEFAULT_POPULATION,
+  type AxisRatings,
+  type PopulationStats,
+  type SchulteTelemetry,
+  type SudokuTelemetry,
+  type StroopTelemetry,
+} from "./lib/scoring";
 import { LogOut, Loader2 } from "lucide-react";
 import { toast, Toaster } from "sonner";
 
@@ -44,40 +63,18 @@
 const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
 
 // ─── Proficiency rating model ───────────────────────────────────────────────────
-// Every cognitive axis is a normalized proficiency rating in [0, RATING_MAX].
-// A round's raw rating is Base_Difficulty × (Target_Time / Actual_Time) × Accuracy,
-// so it measures skill (speed + precision at a given difficulty) rather than volume.
-// RATING_MAX is the shared cap, imported from lib/api (single source of truth).
-const clampRating = (n: number) => Math.max(0, Math.min(RATING_MAX, Math.round(n)));
-
-// The stored rating is an upward-only moving average: a strong round pulls the
-// average up by EMA_ALPHA of the gap; a weaker round never lowers proficiency.
-// This rewards consistent high performance and prevents both score inflation
-// (from grinding) and score collapse (from one bad round).
-const EMA_ALPHA = 0.4;
-export function pullUpRating(prev: number | null | undefined, round: number): number {
-  const o = prev ?? 0;
-  if (round <= o) return o;
-  return clampRating(o + EMA_ALPHA * (round - o));
-}
+// All rating maths lives in ./lib/scoring, which is the single source of truth.
+// Each of the five axes has its OWN formula fed by its OWN signal, so one fast
+// round can no longer lift every axis at once. See that file for the rationale.
 
 // Global Cognitive Index (average of all 5 axes) lives in the API layer as the
 // single source of truth — see cognitiveIndex() — so the dashboard and the
 // leaderboard can never desync. Round it for display.
 const displayIndex = (p: Profile): number => Math.round(cognitiveIndex(p));
 
-// Derives an estimated brain age from the average of the 5 radar axes (0–100).
-// avg 0 → brain age 58, avg 100 → brain age 18; ringPct: 1 = full ring (youngest).
-function calcBrainAge(p: Profile) {
-  const data = buildCognitiveDataRaw(p);
-  const avg = data.reduce((s, d) => s + d.value, 0) / data.length;
-  const age = Math.round(58 - (avg / 100) * 40);
-  // delta vs population baseline of 30 yrs brain age at avg=50
-  const baseline = Math.round(58 - (50 / 100) * 40); // = 38
-  const delta = baseline - age; // positive = younger than average
-  const ringPct = Math.max(0, Math.min(1, (avg / 100)));
-  return { age, delta, ringPct };
-}
+/** Total rounds across all three games — drives brain-age calibration. */
+const totalRounds = (p: Profile) =>
+  (p.schulte_sessions ?? 0) + (p.sudoku_sessions ?? 0) + (p.stroop_sessions ?? 0);
 
 // Each domain is the stored proficiency rating (0–RATING_MAX) mapped to 0–100
 // for the radar. No session division: the rating is already a moving average.
@@ -96,61 +93,61 @@
   return buildCognitiveDataRaw(p);
 }
 
-// ─── Per-round score calculators ──────────────────────────────────────────────
+// ─── Round result ─────────────────────────────────────────────────────────────
+
+export type RoundAxisRow = {
+  label: string;
+  color: string;
+  /** What this round alone scored on the axis. */
+  round: number;
+  /** Stored rating before the round. */
+  prev: number;
+  /** Stored rating after the round. */
+  next: number;
+};
 
 export type RoundResult = {
   game: "schulte" | "sudoku" | "stroop";
   timeMs: number;
-  scores: { label: string; value: number; color: string }[]; // axis ratings (0–RATING_MAX)
-  pointsEarned: number; // this round's rating (0–RATING_MAX)
-  label: string; // e.g. "5×5 Classic" or "Expert" or "Stroop · Hard"
+  /** Only the axes this game actually measures. */
+  rows: RoundAxisRow[];
+  /** Best axis earned this round, for the headline badge. */
+  headline: number;
+  label: string; // e.g. "5×5 Classic" or "Expert"
 };
 
-// Target completion times (ms) per Schulte grid size
-const SCHULTE_TARGETS: Record<number, number> = { 9: 20000, 16: 45000, 25: 90000, 36: 160000 };
-
-// Target completion times (ms) per Sudoku difficulty
-const SUDOKU_TARGETS: Record<string, number> = {
-  Easy: 240000, Medium: 360000, Hard: 480000, Expert: 720000, Master: 960000, Extreme: 1500000,
-};
-const SUDOKU_DIFF_WEIGHT: Record<string, number> = {
-  Easy: 0.5, Medium: 0.6, Hard: 0.7, Expert: 0.8, Master: 0.9, Extreme: 1.0,
-};
-
-// ─── Dynamic round ratings (0–RATING_MAX) ───────────────────────────────────────
-// Score = Base_Difficulty × (Target_Time / Actual_Time) × Accuracy.
-// Base_Difficulty is the ceiling reachable at a given difficulty when the player
-// hits the target time with perfect accuracy — so easy levels alone can never
-// max an axis; only harder challenges push the rating toward RATING_MAX.
-const TIME_RATIO_CAP = 1.4; // reward finishing under target, but bound the bonus
-
-// Fraction of RATING_MAX reachable per Schulte grid size (by cell count).
-const SCHULTE_DIFF_FACTOR: Record<number, number> = { 9: 0.55, 16: 0.72, 25: 0.86, 36: 1.0 };
-// Fraction of RATING_MAX reachable in Stroop (single fixed-difficulty inhibition task).
-const STROOP_DIFF_FACTOR = 0.82;
-
-export function calcSchulteRating(timeMs: number, cells: number, wrongClicks: number): number {
-  const target = SCHULTE_TARGETS[cells] ?? 90000;
-  const base = RATING_MAX * (SCHULTE_DIFF_FACTOR[cells] ?? 0.7);
-  const timeRatio = Math.min(target / Math.max(timeMs, 1), TIME_RATIO_CAP);
-  const accuracy = cells / (cells + Math.max(0, wrongClicks));
-  return clampRating(base * timeRatio * accuracy);
-}
-
-export function calcStroopRating(timeMs: number, totalStimuli: number, wrongClicks: number): number {
-  const target = totalStimuli * 1800;
-  const base = RATING_MAX * STROOP_DIFF_FACTOR;
-  const timeRatio = Math.min(target / Math.max(timeMs, 1), TIME_RATIO_CAP);
-  const accuracy = totalStimuli / (totalStimuli + Math.max(0, wrongClicks));
-  return clampRating(base * timeRatio * accuracy);
-}
+// Axis display metadata plus the profile column each axis persists to.
+const AXIS_META = {
+  speed:   { label: "Speed",   color: "#10B981", column: "speed_score" },
+  focus:   { label: "Focus",   color: "#A855F7", column: "focus_score" },
+  spatial: { label: "Spatial", color: "#F59E0B", column: "cfop_spatial_record" },
+  logic:   { label: "Logic",   color: "#00D4FF", column: "algebraic_logic_score" },
+  memory:  { label: "Memory",  color: "#F43F5E", column: "memory_score" },
+} as const;
+
+type AxisKey = keyof typeof AXIS_META;
+
+/**
+ * Converts a round's per-axis ratings into the columns to persist and the rows
+ * to display. Axes a game does not measure come back `null` from the scorer and
+ * are skipped entirely — Sudoku never writes Focus, Stroop never writes Logic.
+ * This is what keeps the five axes genuinely independent.
+ */
+function applyAxes(profile: Profile, axes: AxisRatings) {
+  const updates: Record<string, number> = {};
+  const rows: RoundAxisRow[] = [];
+
+  (Object.keys(AXIS_META) as AxisKey[]).forEach((key) => {
+    const round = axes[key];
+    if (round === null) return;
+    const meta = AXIS_META[key];
+    const prev = sanitizeRating(profile[meta.column as keyof Profile] as number | null);
+    const next = pullUpRating(prev, round);
+    updates[meta.column] = next;
+    rows.push({ label: meta.label, color: meta.color, round, prev, next });
+  });
 
-export function calcSudokuRating(timeMs: number, difficulty: string, mistakes: number): number {
-  const target = SUDOKU_TARGETS[difficulty] ?? 480000;
-  const base = RATING_MAX * (SUDOKU_DIFF_WEIGHT[difficulty] ?? 0.7);
-  const timeRatio = Math.min(target / Math.max(timeMs, 1), TIME_RATIO_CAP);
-  const accuracy = Math.max(0, 1 - mistakes / 3);
-  return clampRating(base * timeRatio * accuracy);
+  return { updates, rows };
 }
 
 // ─── Schulte Table helpers ─────────────────────────────────────────────────────
@@ -267,6 +264,11 @@
   const [activePage, setActivePage] = useState<DockPage>("dashboard");
   const [selectedGame, setSelectedGame] = useState<"schulte" | "sudoku" | "stroop" | null>(null);
   const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
+  // Real distribution of Cognitive Index across users — the baseline the brain
+  // age is ranked against. Seeded until enough calibrated players exist.
+  const [popStats, setPopStats] = useState<PopulationStats>(DEFAULT_POPULATION);
+  const [birthYearInput, setBirthYearInput] = useState("");
+  const [savingAge, setSavingAge] = useState(false);
 
   useEffect(() => {
     (async () => {
@@ -292,6 +294,38 @@
     }
   };
 
+  // Load the population baseline once a session is active. Failure is silent:
+  // the seed distribution keeps the dial rendering.
+  useEffect(() => {
+    if (!profile) return;
+    (async () => {
+      try {
+        setPopStats(await fetchPopulationStats());
+      } catch (err) {
+        console.error("Population stats unavailable, using seed baseline:", err);
+      }
+    })();
+  }, [profile?.id]);
+
+  const submitBirthYear = async () => {
+    const year = parseInt(birthYearInput, 10);
+    const thisYear = new Date().getFullYear();
+    if (!Number.isFinite(year) || year < 1900 || year > thisYear) {
+      toast.error(t.birth_year_invalid);
+      return;
+    }
+    setSavingAge(true);
+    try {
+      setProfile(await saveBirthYear(year));
+      setBirthYearInput("");
+    } catch (err) {
+      console.error("Save birth year failed:", err);
+      toast.error(t.save_failed);
+    } finally {
+      setSavingAge(false);
+    }
+  };
+
   // Called after a game round has saved its scores. `saved` is the confirmed row
   // returned by the write (.update().select().single()), so we render it
   // immediately — no round-trip that could read stale/replicated data. Then we
@@ -351,7 +385,14 @@
   const isAdmin = profile.username.trim().toLowerCase() === "nguyenhuumanh";
 
   const cognitiveData = buildCognitiveData(profile);
-  const brainAge = calcBrainAge(profile);
+  const brainAge = calcBrainAge(
+    {
+      cognitiveIndex: cognitiveIndex(profile),
+      birthYear: profile.birth_year,
+      roundsPlayed: totalRounds(profile),
+    },
+    popStats,
+  );
 
   if (adminPanelOpen)
     return (
@@ -485,35 +526,84 @@
 
             <GlassCard accent="#A855F7" className="p-6">
               <Label color="#A855F7">{t.brain_age}</Label>
-              <div className="flex items-center gap-5 mt-4">
-                <div className="relative shrink-0">
-                  <svg width="88" height="88" viewBox="0 0 88 88">
-                    <defs>
-                      <linearGradient id="ageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
-                        <stop offset="0%" stopColor="#A855F7" />
-                        <stop offset="100%" stopColor="#00D4FF" />
-                      </linearGradient>
-                    </defs>
-                    <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth="7" />
-                    <circle cx="44" cy="44" r="36" fill="none" stroke="url(#ageGrad)" strokeWidth="7" strokeLinecap="round"
-                      strokeDasharray={`${2 * Math.PI * 36 * brainAge.ringPct} ${2 * Math.PI * 36 * (1 - brainAge.ringPct)}`}
-                      strokeDashoffset={2 * Math.PI * 36 * 0.25}
-                      style={{ filter: "drop-shadow(0 0 8px rgba(168,85,247,0.7))", transition: "stroke-dasharray 0.8s ease" }}
+
+              {/* Brain age is only shown once it can actually mean something:
+                  we need the player's real age to shift from, and enough rounds
+                  to rank them. Anything less would be a decorative number. */}
+              {brainAge.status === "needs_age" ? (
+                <div className="mt-4 flex flex-col gap-3">
+                  <div className="text-xs text-slate-400 leading-relaxed">{t.brain_age_needs_age}</div>
+                  <div className="flex gap-2">
+                    <input
+                      value={birthYearInput}
+                      onChange={(e) => setBirthYearInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
+                      inputMode="numeric"
+                      placeholder={t.birth_year_placeholder}
+                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm text-white outline-none"
+                      style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.25)" }}
+                    />
+                    <button
+                      onClick={submitBirthYear}
+                      disabled={savingAge}
+                      className="px-4 py-2 rounded-xl text-xs font-bold tracking-wider shrink-0 transition-all duration-150 hover:brightness-125 disabled:opacity-60"
+                      style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(168,85,247,0.18)", color: "#A855F7", border: "1px solid rgba(168,85,247,0.4)" }}
+                    >
+                      {savingAge ? t.saving : t.save_btn}
+                    </button>
+                  </div>
+                </div>
+              ) : brainAge.status === "calibrating" ? (
+                <div className="mt-4 flex flex-col gap-3">
+                  <div className="text-xs text-slate-400 leading-relaxed">
+                    {t.brain_age_calibrating(brainAge.roundsPlayed, brainAge.roundsNeeded)}
+                  </div>
+                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
+                    <div
+                      className="h-full rounded-full"
+                      style={{
+                        width: `${(brainAge.roundsPlayed / brainAge.roundsNeeded) * 100}%`,
+                        background: "linear-gradient(90deg, #A855F7, #00D4FF)",
+                        transition: "width 0.6s ease",
+                      }}
                     />
-                    <text x="44" y="49" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="JetBrains Mono, monospace">{brainAge.age}</text>
-                  </svg>
+                  </div>
                 </div>
-                <div>
-                  <div className="text-4xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{brainAge.age} yrs</div>
-                  <div className="text-xs text-slate-400 mt-1.5">{t.pop_baseline}</div>
-                  <div
-                    className="text-xs mt-1 font-semibold"
-                    style={{ fontFamily: "'JetBrains Mono', monospace", color: brainAge.delta >= 0 ? "#10B981" : "#F43F5E" }}
-                  >
-                    {brainAge.delta >= 0 ? t.yrs_younger(brainAge.delta) : t.yrs_older(Math.abs(brainAge.delta))}
+              ) : (
+                <div className="flex items-center gap-5 mt-4">
+                  <div className="relative shrink-0">
+                    <svg width="88" height="88" viewBox="0 0 88 88">
+                      <defs>
+                        <linearGradient id="ageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
+                          <stop offset="0%" stopColor="#A855F7" />
+                          <stop offset="100%" stopColor="#00D4FF" />
+                        </linearGradient>
+                      </defs>
+                      <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth="7" />
+                      <circle cx="44" cy="44" r="36" fill="none" stroke="url(#ageGrad)" strokeWidth="7" strokeLinecap="round"
+                        strokeDasharray={`${2 * Math.PI * 36 * brainAge.ringPct} ${2 * Math.PI * 36 * (1 - brainAge.ringPct)}`}
+                        strokeDashoffset={2 * Math.PI * 36 * 0.25}
+                        style={{ filter: "drop-shadow(0 0 8px rgba(168,85,247,0.7))", transition: "stroke-dasharray 0.8s ease" }}
+                      />
+                      <text x="44" y="49" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="JetBrains Mono, monospace">{brainAge.age}</text>
+                    </svg>
+                  </div>
+                  <div>
+                    <div className="text-4xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{brainAge.age} yrs</div>
+                    <div className="text-xs text-slate-400 mt-1.5">
+                      {t.brain_age_percentile(Math.round(brainAge.percentile * 100), brainAge.realAge)}
+                    </div>
+                    <div
+                      className="text-xs mt-1 font-semibold"
+                      style={{ fontFamily: "'JetBrains Mono', monospace", color: brainAge.delta >= 0 ? "#10B981" : "#F43F5E" }}
+                    >
+                      {brainAge.delta >= 0 ? t.yrs_younger(brainAge.delta) : t.yrs_older(Math.abs(brainAge.delta))}
+                    </div>
+                    {brainAge.provisional && (
+                      <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">{t.brain_age_provisional}</div>
+                    )}
                   </div>
                 </div>
-              </div>
+              )}
             </GlassCard>
           </div>
 