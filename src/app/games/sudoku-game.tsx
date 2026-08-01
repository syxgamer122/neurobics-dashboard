import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Grid3X3, Loader2, RefreshCw, Star } from "lucide-react";
import { useLang } from "../lib/i18n";
import { generateSudoku } from "../lib/sudoku-gen";
import type { SudokuTelemetry } from "../lib/scoring";

export type Difficulty =
  "Easy" | "Medium" | "Hard" | "Expert" | "Master" | "Extreme";

// clues = how many numbers remain on the initial board (fewer = harder);
// points = algebraic_logic_score reward for solving at that level.
// Clue counts follow sudoku.com's 6-tier scale (Easy 38 → Extreme 23);
// points scale the algebraic_logic_score reward per solve.
const SUDOKU_LEVELS: {
  id: Difficulty;
  clues: number;
  points: number;
  accent: string;
}[] = [
    { id: "Easy", clues: 38, points: 1, accent: "#10B981" },
    { id: "Medium", clues: 36, points: 2, accent: "#00D4FF" },
    { id: "Hard", clues: 32, points: 3, accent: "#A855F7" },
    { id: "Expert", clues: 30, points: 4, accent: "#F59E0B" },
    { id: "Master", clues: 26, points: 5, accent: "#F97316" },
    { id: "Extreme", clues: 23, points: 6, accent: "#F43F5E" },
  ];

// ─── App ──────────────────────────────────────────────────────────────────────
// ─── Sudoku Game ───────────────────────────────────────────────────────────────

// Lỗi báo hiệu request generate đã bị thay bởi request mới hơn (đổi độ khó nhanh).
class SupersededError extends Error {
  readonly superseded = true;
  constructor() {
    super("Superseded by newer sudoku request");
    this.name = "SupersededError";
  }
}

export function isSuperseded(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { superseded?: boolean }).superseded === true;
}

export function SudokuGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: SudokuTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const workerReqRef = useRef(0);
  // So clue thuc te cua de dang choi + co bao de bi cat dao som.
  const actualCluesRef = useRef<number | null>(null);
  const budgetExceededRef = useRef(false);
  const pendingGenRef = useRef<{
    resolve: (v: {
      puzzle: (number | null)[][];
      solution: number[][];
      actualClues: number;
      budgetExceeded: boolean;
    }) => void;
    reject: (e: unknown) => void;
    requestId: number;
  } | null>(null);

  const ensureSudokuWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      const w = new Worker(new URL("../lib/sudoku-worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (ev: MessageEvent) => {
        const pending = pendingGenRef.current;
        if (!pending) return;
        if (ev.data?.requestId !== pending.requestId) return;
        pendingGenRef.current = null;
        pending.resolve({
          puzzle: ev.data.puzzle,
          solution: ev.data.solution,
          actualClues: ev.data.actualClues,
          budgetExceeded: ev.data.budgetExceeded,
        });
      };
      w.onerror = (err) => {
        const pending = pendingGenRef.current;
        pendingGenRef.current = null;
        pending?.reject(err);
      };
      workerRef.current = w;
      return w;
    } catch (err) {
      console.warn("Sudoku worker unavailable, using main thread:", err);
      return null;
    }
  }, []);

  const generateSudokuAsync = useCallback(
    (clues: number) =>
      new Promise<{
        puzzle: (number | null)[][];
        solution: number[][];
        actualClues: number;
        budgetExceeded: boolean;
      }>(
        (resolve, reject) => {
          const w = ensureSudokuWorker();
          if (!w) {
            resolve(generateSudoku(clues));
            return;
          }
          const requestId = ++workerReqRef.current;
          // Hủy request cũ trước khi ghi đè, nếu không promise cũ treo vĩnh viễn.
          pendingGenRef.current?.reject(new SupersededError());
          pendingGenRef.current = { resolve, reject, requestId };
          w.postMessage({ clues, requestId });
        },
      ),
    [ensureSudokuWorker],
  );

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingGenRef.current?.reject(new SupersededError());
      pendingGenRef.current = null;
    },
    [],
  );

  const { t } = useLang();
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const level = SUDOKU_LEVELS.find((l) => l.id === difficulty)!;
  const [{ puzzle, solution }, setPuzzleData] = useState<{
    puzzle: (number | null)[][];
    solution: number[][];
  }>({ puzzle: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null as number | null)), solution: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0)) });
  const [userGrid, setUserGrid] = useState<(number | null)[][]>(() =>
    Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null as number | null)),
  );
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [generating, setGenerating] = useState(false);
  const MAX_MISTAKES = 3;
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((x) => x !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
  }, []);
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

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    },
    [],
  );

  // Build a fresh board for the given difficulty and reset all play state.
  const startBoard = useCallback(
    (diff: Difficulty) => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearTimers();
      const lvl = SUDOKU_LEVELS.find((l) => l.id === diff)!;
      // Sinh đề off-thread qua Web Worker (fallback main thread nếu worker lỗi).
      setGenerating(true);
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
      actualCluesRef.current = null;
      budgetExceededRef.current = false;
      void generateSudokuAsync(lvl.clues)
        .then((nd) => {
          actualCluesRef.current = nd.actualClues;
          budgetExceededRef.current = nd.budgetExceeded;
          setPuzzleData(nd);
          setUserGrid(nd.puzzle.map((r) => [...r]));
        })
        .catch((err) => {
          // Request bi thay boi request moi hon => bo qua, khong ve de cu len.
          if (isSuperseded(err)) return;
          console.error("Sudoku generate failed:", err);
          const nd = generateSudoku(lvl.clues);
          actualCluesRef.current = nd.actualClues;
          budgetExceededRef.current = nd.budgetExceeded;
          setPuzzleData(nd);
          setUserGrid(nd.puzzle.map((r) => [...r]));
        })
        .finally(() => {
          setGenerating(false);
        });
    },
    [generateSudokuAsync, clearTimers],
  );

  // First board via worker (avoid sync generateSudoku on mount).
  useEffect(() => {
    startBoard(difficulty);
    return () => {
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Win (board full) HOAC thua (het mang): submit telemetry — khong reset im lang.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    const solved = userGrid.every((row, ri) =>
      row.every((v, ci) => v === solution[ri][ci]),
    );
    const lost = mistakes >= MAX_MISTAKES;
    if (!solved && !lost) return;

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
          failed: lost && !solved,
          // Gui so clue THAT: neu generator het budget, de de hon nhan do kho.
          actualClues: actualCluesRef.current ?? undefined,
          budgetExceeded: budgetExceededRef.current,
        });
      } catch (err) {
        console.error("Sudoku completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [userGrid, solution, status, difficulty, mistakes, onComplete]);

  const reset = useCallback(
    () => startBoard(difficulty),
    [startBoard, difficulty],
  );

  // Changing difficulty immediately generates a new board at that level.
  const changeDifficulty = useCallback(
    (diff: Difficulty) => {
      if (diff === difficulty) return;
      // Dang choi dang do: doi do kho se xoa sach tien do => phai hoi truoc.
      if (status === "playing") {
        const msg = t.confirm_change_difficulty ?? "Discard current game?";
        if (!window.confirm(msg)) return;
      }
      setDifficulty(diff);
      startBoard(diff);
    },
    [startBoard, difficulty, status, t],
  );

  const ensureStarted = useCallback(() => {
    if (status === "idle") {
      onPlayStart?.();
      startRef.current = Date.now();
      lastMoveRef.current = startRef.current;
      setStatus("playing");
      timerRef.current = setInterval(
        () => setElapsed(Date.now() - startRef.current!),
        500,
      );
    }
  }, [status, onPlayStart]);

  const inputNumber = useCallback(
    async (n: number) => {
      if (!selected || status === "done") return;
      const [r, c] = selected;
      if (puzzle[r][c] !== null) return;
      // Ignore re-tapping the same digit already in the cell (no RT/placement bump).
      if (userGrid[r][c] === n) return;

      // O da dung: dem re-entry (mat dau suy luan) roi chan — dung pha o.
      if (userGrid[r][c] === solution[r][c]) {
        reEntriesRef.current += 1;
        return;
      }

      ensureStarted();

      const cellKey = `${r},${c}`;
      const now = Date.now();
      moveRtsRef.current.push(now - (lastMoveRef.current ?? now));
      lastMoveRef.current = now;

      const isWrong = n !== solution[r][c];
      if (isWrong) {
        if (wrongCellsRef.current.has(cellKey)) repeatMistakesRef.current += 1;
        else wrongCellsRef.current.add(cellKey);
        const next = mistakes + 1;
        setMistakes(next);
        const ng = userGrid.map((row) => [...row]);
        ng[r][c] = n;
        setUserGrid(ng);
        later(() => {
          setUserGrid((prev) =>
            prev.map((row, ri) =>
              row.map((v, ci) =>
                ri === r && ci === c && v !== solution[r][c] ? null : v,
              ),
            ),
          );
          // Het mang: effect completion se submit — khong reset im lang.
        }, 600);
        return;
      }

      placementsRef.current += 1;

      // Place the digit — the completion effect watches userGrid and fires
      // onComplete once the whole board matches the solution.
      const ng = userGrid.map((row) => [...row]);
      ng[r][c] = n;
      setUserGrid(ng);
    },
    [
      selected,
      status,
      puzzle,
      userGrid,
      solution,
      mistakes,
      ensureStarted,
      later,
    ],
  );

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
    userGrid.reduce(
      (sum, row, r) =>
        sum + row.filter((v, c) => v === i + 1 && v === solution[r][c]).length,
      0,
    ),
  );

  const getHighlight = (
    r: number,
    c: number,
  ): "selected" | "samenum" | "peer" | "none" => {
    if (!selected) return "none";
    const [sr, sc] = selected;
    if (r === sr && c === sc) return "selected";
    const selVal = userGrid[sr][sc];
    if (selVal !== null && userGrid[r][c] === selVal) return "samenum";
    if (
      r === sr ||
      c === sc ||
      (Math.floor(r / 3) === Math.floor(sr / 3) &&
        Math.floor(c / 3) === Math.floor(sc / 3))
    )
      return "peer";
    return "none";
  };

  const isErr = (r: number, c: number) => {
    const v = userGrid[r][c];
    return v !== null && puzzle[r][c] === null && v !== solution[r][c];
  };

  const p2 = (n: number) => String(n).padStart(2, "0");
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(13,20,45,0.62)",
        border: "1px solid rgba(0,212,255,0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-[11px] tracking-[0.2em] mb-2"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "#00D4FF",
            }}
          >
            {t.logic_training}
          </div>
          <div className="text-base font-bold text-white">Sudoku</div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-2xl font-bold tabular-nums"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: status === "done" ? "#10B981" : "#00D4FF",
            }}
          >
            {fmtTime(elapsed)}
          </div>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(0,212,255,0.18)",
              color: "#00D4FF",
              border: "1px solid rgba(0,212,255,0.28)",
            }}
          >
            <Grid3X3 size={16} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
        <span
          className="text-[11px] px-2 py-0.5 rounded"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            background: `${level.accent}22`,
            color: level.accent,
            border: `1px solid ${level.accent}44`,
          }}
        >
          {level.clues} {t.clues}
        </span>
        <span
          className="text-[11px] flex items-center gap-1"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: level.accent,
          }}
        >
          <Star size={10} />+{level.points} LOGIC
        </span>
        {/* Mistake hearts */}
        <div className="flex items-center gap-0.5 ml-1">
          {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
            <span
              key={i}
              role="img"
              aria-label={
                i < mistakes
                  ? (t.heart_empty ?? "Life lost")
                  : (t.heart_full ?? "Life remaining")
              }
              style={{
                fontSize: 12,
                opacity: i < mistakes ? 0.25 : 1,
                transition: "opacity 0.3s",
              }}
            >
              <span aria-hidden="true">❤️</span>
            </span>
          ))}
        </div>
        {status === "done" && (
          <span
            className="text-[11px] text-emerald-400 ml-auto flex items-center gap-1"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <CheckCircle size={10} /> {t.solved}
          </span>
        )}
      </div>

      {/* ── Difficulty selector ── */}
      <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {SUDOKU_LEVELS.map((l) => {
          const isActive = l.id === difficulty;
          return (
            <button
              key={l.id}
              onClick={() => changeDifficulty(l.id)}
              disabled={saving || generating}
              className="rounded-lg py-1.5 text-[11px] font-bold tracking-wide transition-all duration-150 disabled:opacity-50"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: isActive
                  ? `${l.accent}22`
                  : "rgba(255,255,255,0.03)",
                color: isActive ? l.accent : "#64748b",
                border: isActive
                  ? `1px solid ${l.accent}66`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: isActive ? `0 0 14px ${l.accent}33` : "none",
              }}
            >
              {(t[l.id as keyof typeof t] as string) ?? l.id}
            </button>
          );
        })}
      </div>

      {generating && (
        <div
          className="mt-3 flex items-center justify-center gap-2 text-[11px]"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "#00D4FF",
          }}
        >
          <Loader2 size={11} className="animate-spin" /> {t.sudoku_generating}
        </div>
      )}

      {/* ── Grid: 3×3 outer (boxes) → 3×3 inner (cells) ── */}
      {/* Bright glowing gutter between the 9 boxes; subtle hairlines within each box. */}
      <div
        className="mt-4 mx-auto w-full max-w-[420px]"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 5,
          padding: 5,
          opacity: generating ? 0.35 : 1,
          pointerEvents: generating ? "none" : "auto",
          transition: "opacity 0.15s",
          background: "rgba(0,212,255,0.55)",
          borderRadius: 12,
          border: "1px solid rgba(0,212,255,0.6)",
          boxShadow:
            "0 0 26px rgba(0,212,255,0.28), inset 0 0 18px rgba(0,212,255,0.12)",
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
                  let bg = isGiven
                    ? "rgba(6,11,26,0.96)"
                    : "rgba(14,22,46,0.96)";
                  if (hl === "peer") bg = "rgba(0,212,255,0.09)";
                  else if (hl === "samenum") bg = "rgba(0,212,255,0.2)";
                  if (isSel) bg = "rgba(0,180,255,0.3)";
                  if (err) bg = "rgba(244,63,94,0.22)";

                  // Pre-filled = bold white; user-entered = bright cyan.
                  let textColor = isGiven
                    ? "#f1f5f9"
                    : err
                      ? "#F43F5E"
                      : "#38E1FF";
                  if (status === "done" && !isGiven) textColor = "#10B981";

                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => {
                        if (status !== "done") setSelected([r, c]);
                      }}
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
                        boxShadow: isSel
                          ? "inset 0 0 14px rgba(0,212,255,0.4)"
                          : "none",
                        textShadow:
                          !isGiven && val
                            ? "0 0 8px rgba(56,225,255,0.5)"
                            : "none",
                        padding: 0,
                      }}
                    >
                      {val ?? ""}
                    </button>
                  );
                }),
              )}
            </div>
          )),
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
              <span style={{ fontSize: 11, opacity: 0.55, lineHeight: 1 }}>
                {remaining}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── New game ── */}
      <button
        onClick={reset}
        disabled={saving || generating}
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
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {t.new_puzzle}
      </button>
    </div>
  );
}
