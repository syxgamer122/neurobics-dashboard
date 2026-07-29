@@ -601,28 +691,20 @@
         {selectedGame === "schulte" && (
           <div className="max-w-lg">
             <SchulteTableGame
-              onComplete={async (timeMs, gridSize, wrongClicks, modeLabel) => {
-                // Single normalized proficiency rating for this round; each trained
-                // axis moves toward it via the upward-only moving average.
-                const rating = calcSchulteRating(timeMs, gridSize, wrongClicks);
-                const updates = {
-                  focus_score:         pullUpRating(profile.focus_score, rating),
-                  speed_score:         pullUpRating(profile.speed_score, rating),
-                  cfop_spatial_record: pullUpRating(profile.cfop_spatial_record, rating),
-                  schulte_sessions:    (profile.schulte_sessions ?? 0) + 1,
-                };
+              onComplete={async (tel) => {
+                // Schulte measures visual search: Spatial, Focus and Speed only.
+                // It says nothing about Logic or Memory, so those are untouched.
+                const axes = scoreSchulte(tel);
+                const { updates, rows } = applyAxes(profile, axes);
                 try {
-                  const saved = await saveScores(updates);
+                  const saved = await saveScores({
+                    ...updates,
+                    schulte_sessions: (profile.schulte_sessions ?? 0) + 1,
+                  } as Parameters<typeof saveScores>[0]);
                   await finishRound(saved);
-                  // Show the actual DB axis ratings (0–RATING_MAX) so the UI matches
-                  // what was persisted — no more 0–100 vs 0–1000 mismatch.
                   setRoundResult({
-                    game: "schulte", timeMs, pointsEarned: rating, label: modeLabel,
-                    scores: [
-                      { label: "Focus",   value: saved.focus_score,             color: "#A855F7" },
-                      { label: "Speed",   value: saved.speed_score,             color: "#00D4FF" },
-                      { label: "Spatial", value: saved.cfop_spatial_record ?? 0, color: "#F59E0B" },
-                    ],
+                    game: "schulte", timeMs: tel.timeMs, label: tel.modeLabel,
+                    headline: roundHeadline(axes), rows,
                   });
                 } catch (err) {
                   console.error("Schulte onComplete: saving scores failed:", err);
@@ -636,24 +718,21 @@
         {selectedGame === "sudoku" && (
           <div className="max-w-md">
             <SudokuGame
-              onComplete={async (timeMs, points, difficulty, mistakes) => {
-                const rating = calcSudokuRating(timeMs, difficulty, mistakes);
-                const updates = {
-                  algebraic_logic_score: pullUpRating(profile.algebraic_logic_score, rating),
-                  memory_score:          pullUpRating(profile.memory_score, rating),
-                  speed_score:           pullUpRating(profile.speed_score, rating),
-                  sudoku_sessions:       (profile.sudoku_sessions ?? 0) + 1,
-                };
+              onComplete={async (tel) => {
+                // Sudoku measures deduction and working memory: Logic, Memory,
+                // Speed. Logic and Memory are deliberately time-free, so a slow
+                // flawless solve still scores high on both.
+                const axes = scoreSudoku(tel);
+                const { updates, rows } = applyAxes(profile, axes);
                 try {
-                  const saved = await saveScores(updates);
+                  const saved = await saveScores({
+                    ...updates,
+                    sudoku_sessions: (profile.sudoku_sessions ?? 0) + 1,
+                  } as Parameters<typeof saveScores>[0]);
                   await finishRound(saved);
                   setRoundResult({
-                    game: "sudoku", timeMs, pointsEarned: rating, label: difficulty,
-                    scores: [
-                      { label: "Logic",  value: saved.algebraic_logic_score, color: "#00D4FF" },
-                      { label: "Memory", value: saved.memory_score,          color: "#A855F7" },
-                      { label: "Speed",  value: saved.speed_score,           color: "#10B981" },
-                    ],
+                    game: "sudoku", timeMs: tel.timeMs, label: tel.difficulty,
+                    headline: roundHeadline(axes), rows,
                   });
                 } catch (err) {
                   console.error("Sudoku onComplete: saving scores failed:", err);
@@ -667,22 +746,19 @@
         {selectedGame === "stroop" && (
           <div className="max-w-sm">
             <StroopGame
-              onComplete={async (timeMs, wrongClicks) => {
-                const rating = calcStroopRating(timeMs, 20, wrongClicks);
-                const updates = {
-                  focus_score:     pullUpRating(profile.focus_score, rating),
-                  speed_score:     pullUpRating(profile.speed_score, rating),
-                  stroop_sessions: (profile.stroop_sessions ?? 0) + 1,
-                };
+              onComplete={async (tel) => {
+                // Stroop measures interference control: Focus and Speed only.
+                const axes = scoreStroop(tel);
+                const { updates, rows } = applyAxes(profile, axes);
                 try {
-                  const saved = await saveScores(updates);
+                  const saved = await saveScores({
+                    ...updates,
+                    stroop_sessions: (profile.stroop_sessions ?? 0) + 1,
+                  } as Parameters<typeof saveScores>[0]);
                   await finishRound(saved);
                   setRoundResult({
-                    game: "stroop", timeMs, pointsEarned: rating, label: "Stroop Test",
-                    scores: [
-                      { label: "Focus", value: saved.focus_score, color: "#F59E0B" },
-                      { label: "Speed", value: saved.speed_score, color: "#00D4FF" },
-                    ],
+                    game: "stroop", timeMs: tel.timeMs, label: "Stroop Test",
+                    headline: roundHeadline(axes), rows,
                   });
                 } catch (err) {
                   console.error("Stroop onComplete: saving scores failed:", err);
@@ -902,7 +978,7 @@
   return seq;
 }
 
-function SchulteTableGame({ onComplete }: { onComplete: (timeMs: number, gridSize: number, wrongClicks: number, modeLabel: string) => Promise<void> }) {
+function SchulteTableGame({ onComplete }: { onComplete: (tel: SchulteTelemetry) => Promise<void> }) {
   const { t } = useLang();
   const [size, setSize] = useState<SSize>(5);
   const [mode, setMode] = useState<SMode>("classic");
@@ -922,6 +998,11 @@
   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
   const wrongClicksRef = useRef(0);
   const completedRef = useRef(false);
+  // Per-find reaction times. The gap between consecutive correct hits is the
+  // real signal here: total time alone can't tell a steady searcher apart from
+  // someone who stalls once and then rushes.
+  const hitRtsRef = useRef<number[]>([]);
+  const lastHitRef = useRef<number | null>(null);
 
   const reset = useCallback((ns: SSize = size, nm: SMode = mode) => {
     if (intervalRef.current) clearInterval(intervalRef.current);
@@ -936,6 +1017,8 @@
     wrongClicksRef.current = 0;
     completedRef.current = false;
     startRef.current = null;
+    hitRtsRef.current = [];
+    lastHitRef.current = null;
   }, [size, mode]);
 
   useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
@@ -959,7 +1042,13 @@
     const modeLabel = `${size}×${size} ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
     (async () => {
       try {
-        await onComplete(ms, size * size, wrongClicksRef.current, modeLabel);
+        await onComplete({
+          timeMs: ms,
+          cells: size * size,
+          wrongClicks: wrongClicksRef.current,
+          hitRts: [...hitRtsRef.current],
+          modeLabel,
+        });
       } catch (err) {
         console.error("Schulte completion: onComplete failed:", err);
       } finally {
@@ -972,6 +1061,7 @@
     if (status === "done" || foundSet.has(idx)) return;
     if (status === "idle") {
       startRef.current = Date.now();
+      lastHitRef.current = startRef.current;
       setStatus("playing");
       intervalRef.current = setInterval(() => setElapsed(Date.now() - (startRef.current ?? Date.now())), 50);
     }
@@ -987,6 +1077,11 @@
       return;
     }
 
+    // Record how long this particular target took to locate.
+    const now = Date.now();
+    hitRtsRef.current.push(now - (lastHitRef.current ?? now));
+    lastHitRef.current = now;
+
     // Advance state only — the completion effect above watches seqIdx and fires
     // onComplete once the final number is reached.
     const nf = new Set(foundSet); nf.add(idx);
@@ -1240,7 +1335,7 @@
 
 // ─── Sudoku Game ───────────────────────────────────────────────────────────────
 
-function SudokuGame({ onComplete }: { onComplete: (timeMs: number, points: number, difficulty: string, mistakes: number) => Promise<void> }) {
+function SudokuGame({ onComplete }: { onComplete: (tel: SudokuTelemetry) => Promise<void> }) {
   const { t } = useLang();
   const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
   const level = SUDOKU_LEVELS.find((l) => l.id === difficulty)!;
@@ -1255,6 +1350,15 @@
   const startRef = useRef<number | null>(null);
   const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
   const completedRef = useRef(false);
+  // Working-memory signals. Overwriting a cell you already solved, or getting
+  // the SAME cell wrong twice, means you lost track of your own deductions —
+  // that is what the Memory axis measures here, independent of the clock.
+  const placementsRef = useRef(0);
+  const moveRtsRef = useRef<number[]>([]);
+  const lastMoveRef = useRef<number | null>(null);
+  const reEntriesRef = useRef(0);
+  const repeatMistakesRef = useRef(0);
+  const wrongCellsRef = useRef<Set<string>>(new Set());
 
   useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
 
@@ -1271,6 +1375,12 @@
     setMistakes(0);
     completedRef.current = false;
     startRef.current = null;
+    placementsRef.current = 0;
+    moveRtsRef.current = [];
+    lastMoveRef.current = null;
+    reEntriesRef.current = 0;
+    repeatMistakesRef.current = 0;
+    wrongCellsRef.current = new Set();
   }, []);
 
   // Declarative win detection: fire onComplete once the board fully matches the
@@ -1289,14 +1399,22 @@
     setSaving(true);
     (async () => {
       try {
-        await onComplete(ms, level.points, difficulty, mistakes);
+        await onComplete({
+          timeMs: ms,
+          difficulty,
+          mistakes,
+          placements: placementsRef.current,
+          moveRts: [...moveRtsRef.current],
+          reEntries: reEntriesRef.current,
+          repeatMistakes: repeatMistakesRef.current,
+        });
       } catch (err) {
         console.error("Sudoku completion: onComplete failed:", err);
       } finally {
         setSaving(false);
       }
     })();
-  }, [userGrid, solution, status, level.points, difficulty, mistakes, onComplete]);
+  }, [userGrid, solution, status, difficulty, mistakes, onComplete]);
 
   const reset = useCallback(() => startBoard(difficulty), [startBoard, difficulty]);
 
@@ -1309,6 +1427,7 @@
   const ensureStarted = useCallback(() => {
     if (status === "idle") {
       startRef.current = Date.now();
+      lastMoveRef.current = startRef.current;
       setStatus("playing");
       timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current!), 500);
     }
@@ -1320,8 +1439,16 @@
     if (puzzle[r][c] !== null) return;
     ensureStarted();
 
+    const cellKey = `${r},${c}`;
+    const now = Date.now();
+    moveRtsRef.current.push(now - (lastMoveRef.current ?? now));
+    lastMoveRef.current = now;
+
     const isWrong = n !== solution[r][c];
     if (isWrong) {
+      // Same cell wrong more than once = the earlier elimination was forgotten.
+      if (wrongCellsRef.current.has(cellKey)) repeatMistakesRef.current += 1;
+      else wrongCellsRef.current.add(cellKey);
       const next = mistakes + 1;
       setMistakes(next);
       const ng = userGrid.map((row) => [...row]);
@@ -1334,6 +1461,10 @@
       return;
     }
 
+    // Re-entry: this cell was already correctly filled and is being rewritten.
+    if (userGrid[r][c] === solution[r][c]) reEntriesRef.current += 1;
+    placementsRef.current += 1;
+
     // Place the digit — the completion effect watches userGrid and fires
     // onComplete once the whole board matches the solution.
     const ng = userGrid.map((row) => [...row]);
@@ -1605,7 +1736,7 @@
   return { wordId, inkId, options };
 }
 
-function StroopGame({ onComplete }: { onComplete: (timeMs: number, wrongClicks: number) => Promise<void> }) {
+function StroopGame({ onComplete }: { onComplete: (tel: StroopTelemetry) => Promise<void> }) {
   const { t, lang } = useLang();
   const TOTAL = 20;
   const MAX_HEARTS = 3;
@@ -1624,6 +1755,10 @@
   const [saving, setSaving] = useState(false);
   const [bestTime, setBestTime] = useState<number | null>(null);
   const wrongRef = useRef(0);
+  // Per-trial reaction times. Stroop interference shows up in the RT spread,
+  // not in the total — so Focus reads consistency while Speed reads the median.
+  const rtsRef = useRef<number[]>([]);
+  const lastTrialRef = useRef<number | null>(null);
   const prevInkRef = useRef<StroopColorId | undefined>(undefined);
   const startRef = useRef<number | null>(null);
   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
@@ -1634,6 +1769,8 @@
   const reset = () => {
     if (intervalRef.current) clearInterval(intervalRef.current);
     wrongRef.current = 0;
+    rtsRef.current = [];
+    lastTrialRef.current = null;
     prevInkRef.current = undefined;
     completedRef.current = false;
     setStimulus(makeStimulus());
@@ -1662,7 +1799,12 @@
     setSaving(true);
     (async () => {
       try {
-        await onComplete(ms, wrongRef.current);
+        await onComplete({
+          timeMs: ms,
+          totalStimuli: TOTAL,
+          wrongClicks: wrongRef.current,
+          rts: [...rtsRef.current],
+        });
       } catch (err) {
         console.error("Stroop completion: onComplete failed:", err);
       } finally {
@@ -1676,10 +1818,15 @@
 
     if (status === "idle") {
       startRef.current = Date.now();
+      lastTrialRef.current = startRef.current;
       setStatus("playing");
       intervalRef.current = setInterval(() => setElapsed(Date.now() - (startRef.current ?? Date.now())), 50);
     }
 
+    const now = Date.now();
+    const rt = now - (lastTrialRef.current ?? now);
+    lastTrialRef.current = now;
+
     const correct = chosen === stimulus.inkId;
     setFlash(correct ? "correct" : "wrong");
 
@@ -1695,6 +1842,10 @@
       return;
     }
 
+    // Only correct responses feed the RT distribution — mixing in error trials
+    // would let fast wrong guesses masquerade as fast processing.
+    rtsRef.current.push(rt);
+
     // Clearing the last trial drops trialsLeft to 0 — the completion effect ends the run.
     prevInkRef.current = stimulus.inkId;
     const newLeft = trialsLeft - 1;
@@ -1949,7 +2100,7 @@
             <span className="text-[8px] tracking-[0.15em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,158,11,0.7)" }}>{t.round_score_label}</span>
             <div className="flex items-center gap-1.5">
               <Star size={11} style={{ color: "#F59E0B" }} />
-              <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F59E0B" }}>{result.pointsEarned} / {RATING_MAX}</span>
+              <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#F59E0B" }}>{result.headline} / {RATING_MAX}</span>
             </div>
           </div>
         </div>
@@ -1964,18 +2115,23 @@
         {/* Domain scores */}
         <div className="flex flex-col gap-3">
           <div className="text-[10px] text-slate-600 tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.current_rating_label} · {t.domains_this_round}</div>
-          {result.scores.map((s) => (
+          {/* Only the axes this game measures appear here, each with its own
+              round score — so it's visible that they no longer move in lockstep. */}
+          {result.rows.map((s) => (
             <div key={s.label} className="flex flex-col gap-1">
               <div className="flex justify-between items-baseline">
                 <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.label.toUpperCase()}</span>
-                <span className="text-sm font-bold tabular-nums text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.value} / {RATING_MAX}</span>
+                <span className="text-sm font-bold tabular-nums text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.next} / {RATING_MAX}</span>
               </div>
               <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                 <div
                   className="h-full rounded-full"
-                  style={{ width: `${(s.value / RATING_MAX) * 100}%`, background: s.color, boxShadow: `0 0 8px ${s.color}88`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}
+                  style={{ width: `${(s.next / RATING_MAX) * 100}%`, background: s.color, boxShadow: `0 0 8px ${s.color}88`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}
                 />
               </div>
+              <div className="text-[9px] text-slate-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
+                {t.round_axis_detail(s.round, s.next > s.prev ? s.next - s.prev : 0)}
+              </div>
             </div>
           ))}
         </div>