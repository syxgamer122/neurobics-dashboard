import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  CheckCircle,
  Focus,
  Loader2,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useLang } from "../lib/i18n";
import {
  fetchSchulteConfigBests,
  schulteBestMapKey,
  type SchulteBestKey,
} from "../lib/api";
import { shuffleArray } from "../lib/sudoku-gen";
import type { SchulteTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Schulte Table Game ────────────────────────────────────────────────────────

type SMode = "classic" | "reverse" | "dual";
type SSize = 3 | 4 | 5 | 6;
interface SCell {
  value: number;
  color: "cyan" | "red";
}

function buildSchulteGrid(size: SSize, mode: SMode): SCell[] {
  const total = size * size;
  if (mode === "dual") {
    const h1 = Math.ceil(total / 2);
    const h2 = Math.floor(total / 2);
    return shuffleArray([
      ...Array.from({ length: h1 }, (_, i) => ({
        value: i + 1,
        color: "cyan" as const,
      })),
      ...Array.from({ length: h2 }, (_, i) => ({
        value: i + 1,
        color: "red" as const,
      })),
    ]);
  }
  return shuffleArray(
    Array.from({ length: total }, (_, i) => ({
      value: i + 1,
      color: "cyan" as const,
    })),
  );
}

function buildSchulteSeq(
  size: SSize,
  mode: SMode,
): Array<{ value: number; color: "cyan" | "red" }> {
  const total = size * size;
  if (mode === "classic")
    return Array.from({ length: total }, (_, i) => ({
      value: i + 1,
      color: "cyan" as const,
    }));
  if (mode === "reverse")
    return Array.from({ length: total }, (_, i) => ({
      value: total - i,
      color: "cyan" as const,
    }));
  const h1 = Math.ceil(total / 2),
    h2 = Math.floor(total / 2);
  const seq: Array<{ value: number; color: "cyan" | "red" }> = [];
  for (let i = 0; i < Math.max(h1, h2); i++) {
    if (i < h1) seq.push({ value: i + 1, color: "cyan" });
    if (i < h2) seq.push({ value: i + 1, color: "red" });
  }
  return seq;
}

export function SchulteTableGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: SchulteTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  const [size, setSize] = useState<SSize>(5);
  const [mode, setMode] = useState<SMode>("classic");
  const [grid, setGrid] = useState<SCell[]>(() =>
    buildSchulteGrid(5, "classic"),
  );
  const [sequence, setSequence] = useState(() => buildSchulteSeq(5, "classic"));
  const [seqIdx, setSeqIdx] = useState(0);
  const [foundSet, setFoundSet] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [flashCell, setFlashCell] = useState<{
    idx: number;
    ok: boolean;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  /**
   * Ky luc TACH theo size x mode.
   * - Server (get_schulte_config_bests): nguon su that khi da dang nhap.
   * - localStorage: cache + fallback offline/guest.
   * Hien thi = min(server, local) cho cau hinh dang chon.
   */
  const [bestByConfig, setBestByConfig] = useState<
    Partial<Record<SchulteBestKey, number>>
  >({});
  const localStorageKey = (ns: SSize, nm: SMode) =>
    `nb_schulte_best_${ns}_${nm}`;
  const readLocalBest = (ns: SSize, nm: SMode): number | null => {
    try {
      const raw = localStorage.getItem(localStorageKey(ns, nm));
      if (!raw) return null;
      const ms = Number(raw);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  };
  const writeLocalBest = (ns: SSize, nm: SMode, ms: number) => {
    try {
      localStorage.setItem(localStorageKey(ns, nm), String(ms));
    } catch {
      /* private mode */
    }
  };
  const mergeBest = (ns: SSize, nm: SMode, ms: number) => {
    const key = schulteBestMapKey(ns, nm);
    setBestByConfig((prev) => {
      const cur = prev[key];
      if (cur != null && cur <= ms) return prev;
      return { ...prev, [key]: ms };
    });
    writeLocalBest(ns, nm, ms);
  };
  const [showCenter, setShowCenter] = useState(true);
  const [hearts, setHearts] = useState(3);
  const MAX_HEARTS = 3;
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongClicksRef = useRef(0);
  // Nap local cache cho moi size x mode (guest/offline) + server theo cau hinh.
  useEffect(() => {
    const local: Partial<Record<SchulteBestKey, number>> = {};
    const sizes: SSize[] = [3, 4, 5, 6];
    const modes: SMode[] = ["classic", "reverse", "dual"];
    for (const ns of sizes) {
      for (const nm of modes) {
        const ms = readLocalBest(ns, nm);
        if (ms != null) local[schulteBestMapKey(ns, nm)] = ms;
      }
    }
    if (Object.keys(local).length) setBestByConfig((prev) => ({ ...local, ...prev }));

    let alive = true;
    (async () => {
      try {
        const rows = await fetchSchulteConfigBests();
        if (!alive) return;
        setBestByConfig((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            if (row.best_time_ms == null || row.best_time_ms <= 0) continue;
            const key = schulteBestMapKey(row.grid_size, row.mode);
            const cur = next[key];
            if (cur == null || row.best_time_ms < cur) {
              next[key] = row.best_time_ms;
              writeLocalBest(row.grid_size, row.mode, row.best_time_ms);
            }
          }
          return next;
        });
      } catch (err) {
        // Guest / migration chua chay: van choi duoc bang local cache.
        logError("Schulte: config bests unavailable:", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const completedRef = useRef(false);
  // Per-find reaction times. The gap between consecutive correct hits is the
  // real signal here: total time alone can't tell a steady searcher apart from
  // someone who stalls once and then rushes.
  const hitRtsRef = useRef<number[]>([]);
  const lastHitRef = useRef<number | null>(null);
  // Mọi hẹn giờ của ván đều được theo dõi, để ván cũ không bắn callback sau khi
  // người chơi đã rời màn hình hoặc đã bắt đầu ván mới.
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

  const reset = useCallback(
    (ns: SSize = size, nm: SMode = mode) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearTimers();
      // Doi size/mode: best hien thi lay tu map theo cau hinh (khong can setState rieng).
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
    },
    [size, mode, clearTimers],
  );

  useEffect(
    () => () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    },
    [],
  );

  // Win (het day) hoac thua (het tim): submit telemetry mot lan — khong bien mat im lang.
  useEffect(() => {
    if (completedRef.current) return;
    if (status !== "playing") return;
    const won = sequence.length > 0 && seqIdx >= sequence.length;
    const lost = hearts <= 0;
    if (!won && !lost) return;

    completedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ms = Date.now() - (startRef.current ?? Date.now());
    setElapsed(ms);
    setStatus("done");
    if (won) mergeBest(size, mode, ms);
    setSaving(true);
    // Label chuan de RPC parse: "5×5 Classic" / "5×5 Reverse (failed)".
    const modeLabel = `${size}×${size} ${mode.charAt(0).toUpperCase() + mode.slice(1)}${
      lost ? " (failed)" : ""
    }`;
    (async () => {
      try {
        await onComplete({
          timeMs: ms,
          cells: size * size,
          wrongClicks: wrongClicksRef.current,
          hitRts: [...hitRtsRef.current],
          modeLabel,
          // Van thua dung giua chung => hitRts NGAN hon cells. Phai bao cho
          // server biet, neu khong no bat buoc hitRts.length === cells va tra
          // ve 400 "Invalid hitRts length", lam mat streak/quest/ticket.
          failed: lost && !won,
          intendedCells: size * size,
        });
        // Dong bo lai tu server sau khi training_sessions da ghi (user that).
        if (won) {
          try {
            const rows = await fetchSchulteConfigBests();
            setBestByConfig((prev) => {
              const next = { ...prev };
              for (const row of rows) {
                if (row.best_time_ms == null || row.best_time_ms <= 0) continue;
                const key = schulteBestMapKey(row.grid_size, row.mode);
                const cur = next[key];
                if (cur == null || row.best_time_ms < cur) {
                  next[key] = row.best_time_ms;
                  writeLocalBest(row.grid_size, row.mode, row.best_time_ms);
                }
              }
              return next;
            });
          } catch {
            /* offline / guest */
          }
        }
      } catch (err) {
        logError("Schulte completion: onComplete failed:", err);
      } finally {
        setSaving(false);
      }
    })();
  }, [seqIdx, sequence.length, status, size, mode, hearts, onComplete]);

  const handleClick = useCallback(
    async (cell: SCell, idx: number) => {
      // Only lock input during a WRONG flash. A correct flash used to block the
      // next cell for 260ms × N hits and inflated Speed/Focus unfairly.
      if (status === "done" || foundSet.has(idx) || flashCell?.ok === false)
        return;

      const wasIdle = status === "idle";
      const target = sequence[seqIdx];
      const ok = cell.value === target.value && cell.color === target.color;

      // Idle: chi bat dong ho khi bam DUNG o dau tien — bam sai khong tinh gio.
      if (wasIdle && !ok) {
        setFlashCell({ idx, ok: false });
        later(() => setFlashCell(null), 380);
        return;
      }

      if (wasIdle && ok) {
        onPlayStart?.();
        startRef.current = Date.now();
        lastHitRef.current = startRef.current;
        setStatus("playing");
        intervalRef.current = setInterval(
          () => setElapsed(Date.now() - (startRef.current ?? Date.now())),
          50,
        );
      }

      setFlashCell({ idx, ok });
      later(() => setFlashCell(null), ok ? 260 : 380);
      if (!ok) {
        wrongClicksRef.current += 1;
        const newHearts = hearts - 1;
        setHearts(newHearts);
        // Het tim: effect completion se submit — khong reset im lang.
        return;
      }

      // Record how long this particular target took to locate.
      const now = Date.now();
      // Van THANG ghi du 'cells' mau; van THUA ghi it hon va gui kem co
      // `failed` de server chap nhan (xem scoreSchulte). Mau mo man ~0ms
      // khong gay hai vi:
      //  - scoreAndValidate chi chay assertRtBounds tren 'rts', KHONG tren 'hitRts',
      //    nen nguong MIN_RT_MS=120 khong ap dung o day;
      //  - numberArray() da nang moi gia tri len toi thieu 1ms;
      //  - withoutStartArtifact() tu loai mau dau khi tinh median/CV.
      hitRtsRef.current.push(now - (lastHitRef.current ?? now));
      lastHitRef.current = now;

      // Advance state only — the completion effect above watches seqIdx and fires
      // onComplete once the final number is reached.
      const nf = new Set(foundSet);
      nf.add(idx);
      setFoundSet(nf);
      setSeqIdx(seqIdx + 1);
    },
    [status, foundSet, sequence, seqIdx, hearts, later, flashCell, onPlayStart],
  );

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
  const displayedBestMs =
    bestByConfig[schulteBestMapKey(size, mode)] ?? null;
  const SIZES: SSize[] = [3, 4, 5, 6];
  const MODES: { id: SMode; label: string; hint: string }[] = [
    { id: "classic", label: t.classic, hint: t.hint_classic(size * size) },
    { id: "reverse", label: t.reverse, hint: t.hint_reverse(size * size) },
    { id: "dual", label: t.dual, hint: t.hint_dual },
  ];

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(13,20,45,0.62)",
        border: "1px solid rgba(168,85,247,0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)"}}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{
              
              color: "#A855F7"}}
          >
            {t.focus_training}
          </div>
          <div className="text-base font-bold text-white">Schulte Table</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCenter((c) => !c)}
            title="Toggle center fixation"
            className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all duration-150"
            style={{
              
              background: showCenter
                ? "rgba(168,85,247,0.18)"
                : "rgba(255,255,255,0.04)",
              color: showCenter ? "#A855F7" : "#475569",
              border: `1px solid ${showCenter ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`}}
          >
            <Focus size={11} /> {t.fixation}
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(168,85,247,0.18)",
              color: "#A855F7",
              border: "1px solid rgba(168,85,247,0.28)"}}
          >
            <Focus size={16} />
          </div>
        </div>
      </div>

      {/* Size selector */}
      <div className="flex items-center gap-2.5 mt-3">
        <span
          className="text-xs text-slate-400 w-10 shrink-0"
        >
          {t.size_label}
        </span>
        <div className="flex gap-1.5">
          {SIZES.map((s) => {
            const active = size === s;
            return (
              <button
                key={s}
                onClick={() => {
                  setSize(s);
                  reset(s, mode);
                }}
                disabled={status === "playing"}
                className="rounded-lg text-xs font-bold px-2.5 py-1 transition-all duration-150 disabled:opacity-40"
                style={{
                  
                  background: active
                    ? "rgba(168,85,247,0.22)"
                    : "rgba(255,255,255,0.04)",
                  color: active ? "#A855F7" : "#475569",
                  border: active
                    ? "1px solid rgba(168,85,247,0.5)"
                    : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: active ? "0 0 12px rgba(168,85,247,0.28)" : "none"}}
              >
                {s}×{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode selector — wrap tren man hep, hint an tren mobile de nut khong vo hang */}
      <div className="flex items-start gap-2.5 mt-2">
        <span className="text-xs text-slate-400 w-10 shrink-0 pt-2">
          {t.mode_label}
        </span>
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  reset(size, m.id);
                }}
                disabled={status === "playing"}
                className="rounded-lg text-xs font-bold px-2.5 py-2 min-h-9 transition-all duration-150 disabled:opacity-40 flex items-center gap-1"
                style={{
                  background: active
                    ? "rgba(168,85,247,0.22)"
                    : "rgba(255,255,255,0.04)",
                  color: active ? "#A855F7" : "#475569",
                  border: active
                    ? "1px solid rgba(168,85,247,0.5)"
                    : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: active
                    ? "0 0 12px rgba(168,85,247,0.28)"
                    : "none",
                }}
              >
                {m.label}
                {active && (
                  <span className="hidden sm:inline" style={{ fontSize: 11, opacity: 0.7 }}>
                    {m.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Score badge + Hearts */}
      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{
            background: "rgba(168,85,247,0.12)",
            border: "1px solid rgba(168,85,247,0.25)"}}
        >
          <Star size={11} style={{ color: "#A855F7" }} />
          <span
            className="text-xs font-bold"
            style={{
              
              color: "#A855F7"}}
          >
            {size === 3
              ? t.size_basic
              : size === 4
                ? t.size_normal
                : size === 5
                  ? t.size_advanced
                  : "MASTER"}{" "}
            · FOCUS
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`${hearts}/${MAX_HEARTS} ${t.heart_full ?? "lives"}`}
        >
          {Array.from({ length: MAX_HEARTS }).map((_, i) => (
            <span
              key={i}
              role="img"
              aria-label={
                i < hearts
                  ? (t.heart_full ?? "Life remaining")
                  : (t.heart_empty ?? "Life lost")
              }
              style={{
                fontSize: 14,
                opacity: i < hearts ? 1 : 0.2,
                transition: "opacity 0.25s",
                filter:
                  i < hearts
                    ? "drop-shadow(0 0 4px rgba(239,68,68,0.6))"
                    : "none"}}
            >
              <span aria-hidden="true">❤️</span>
            </span>
          ))}
        </div>
      </div>

      {/* Timer + "Find N" */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span
            className="text-xs text-slate-400 mb-0.5"
          >
            {t.time_label}
          </span>
          <div
            className="text-3xl font-bold tabular-nums font-mono"
            style={{
              
              color: status === "done" ? "#10B981" : "#A855F7",
              textShadow:
                status === "done"
                  ? "0 0 24px rgba(16,185,129,0.5)"
                  : "0 0 18px rgba(168,85,247,0.4)"}}
          >
            {fmtTime(elapsed)}
          </div>
          {displayedBestMs !== null && (
            <span
              className="text-xs mt-0.5"
              style={{
                
                color: "#475569"}}
            >
              {t.best_label} {fmtTime(displayedBestMs)}
            </span>
          )}
        </div>

        {status !== "done" ? (
          <div className="flex flex-col items-end">
            <span
              className="text-xs text-slate-400 mb-0.5"
            >
              {status === "idle" ? t.start_with_label : t.find_label}
            </span>
            <div className="flex items-center gap-2">
              {mode === "dual" && target && (
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: target.color === "red" ? "#F43F5E" : "#A855F7",
                    boxShadow: `0 0 8px ${target.color === "red" ? "rgba(244,63,94,0.7)" : "rgba(168,85,247,0.7)"}`}}
                />
              )}
              <span
                className="text-4xl font-bold tabular-nums font-mono"
                style={{
                  
                  color: target?.color === "red" ? "#F43F5E" : "#A855F7",
                  textShadow: `0 0 20px ${target?.color === "red" ? "rgba(244,63,94,0.65)" : "rgba(168,85,247,0.65)"}`}}
              >
                {status === "idle"
                  ? mode === "reverse"
                    ? size * size
                    : "1"
                  : (target?.value ?? "✓")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <span
              className="text-xs text-emerald-400 flex items-center gap-1.5"
            >
              <CheckCircle size={13} /> {t.complete}
            </span>
            <span
              className="text-xs text-slate-400"
            >
              {size}×{size} · {mode}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="mt-2.5 h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, #A855F7, #00D4FF)",
            boxShadow: "0 0 8px rgba(168,85,247,0.5)"}}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span
          className="text-xs text-slate-400"
        >
          0
        </span>
        <span
          className="text-xs text-slate-400"
        >
          {seqIdx} / {sequence.length}
        </span>
        <span
          className="text-xs text-slate-400"
        >
          {sequence.length}
        </span>
      </div>

      {/* Grid */}
      <div
        className="mt-4 relative mx-auto w-full"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: size >= 6 ? 4 : 5,
          maxWidth: size <= 3 ? 280 : size === 4 ? 340 : 420}}
      >
        {/* Center fixation crosshair */}
        {showCenter && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div style={{ position: "relative", width: 24, height: 24 }}>
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "rgba(168,85,247,0.45)",
                  transform: "translateY(-50%)"}}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "rgba(168,85,247,0.45)",
                  transform: "translateX(-50%)"}}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#A855F7",
                  boxShadow:
                    "0 0 10px rgba(168,85,247,0.9), 0 0 20px rgba(168,85,247,0.4)"}}
              />
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
                
                position: "relative",
                aspectRatio: "1",
                fontSize:
                  size === 6 ? 12 : size === 3 ? 22 : size === 4 ? 18 : 15,
                background: isFlash
                  ? flashCell!.ok
                    ? "rgba(16,185,129,0.32)"
                    : "rgba(244,63,94,0.25)"
                  : isDone
                    ? "rgba(168,85,247,0.06)"
                    : "rgba(255,255,255,0.04)",
                color: isFlash
                  ? flashCell!.ok
                    ? "#10B981"
                    : "#F43F5E"
                  : isDone
                    ? "#10B981"
                    : isRed
                      ? "#F97316"
                      : "#e2e8f0",
                border: isFlash
                  ? `1px solid ${flashCell!.ok ? "rgba(16,185,129,0.55)" : "rgba(244,63,94,0.5)"}`
                  : isDone
                    ? "1px solid rgba(16,185,129,0.25)"
                    : isRed
                      ? "1px solid rgba(249,115,22,0.22)"
                      : "1px solid rgba(255,255,255,0.07)",
                boxShadow:
                  isFlash && flashCell!.ok
                    ? "0 0 18px rgba(16,185,129,0.42)"
                    : isDone
                      ? "0 0 8px rgba(16,185,129,0.12)"
                      : undefined,
                transform: isFlash
                  ? flashCell!.ok
                    ? "scale(0.88)"
                    : "scale(0.96)"
                  : "scale(1)",
                opacity: isDone ? 0.45 : 1,
                cursor: status === "done" || isDone ? "default" : "pointer"}}
            >
              {isFlash && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    lineHeight: 0}}
                >
                  {flashCell!.ok ? (
                    <Check
                      size={11}
                      aria-label={t.answer_correct ?? "Correct"}
                      style={{ color: "#10B981" }}
                    />
                  ) : (
                    <X
                      size={11}
                      aria-label={t.answer_wrong ?? "Wrong"}
                      style={{ color: "#F43F5E" }}
                    />
                  )}
                </span>
              )}
              {cell.value}
            </button>
          );
        })}
      </div>

      {/* Idle hint */}
      {status === "idle" && (
        <div
          className="mt-3 text-xs text-center text-slate-500"
        >
          {mode === "dual"
            ? t.idle_dual
            : mode === "reverse"
              ? t.idle_reverse(size * size)
              : t.idle_classic(size * size)}
        </div>
      )}

      {saving && (
        <div
          className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400"
        >
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      <button
        disabled={saving}
        onClick={() => reset()}
        className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 hover:brightness-125"
        style={{
          
          background: "rgba(168,85,247,0.14)",
          color: "#A855F7",
          border: "1px solid rgba(168,85,247,0.25)"}}
      >
        <RefreshCw size={12} /> {t.new_game}
      </button>
    </div>
  );
}
