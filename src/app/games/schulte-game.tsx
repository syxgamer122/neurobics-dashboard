import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSchulteConfigBests,
  schulteBestMapKey,
  type SchulteBestKey,
} from "../lib/api";
import { logError } from "../lib/logger";
import type { SchulteTelemetry } from "../lib/scoring";
import {
  buildSchulteGrid,
  buildSchulteSeq,
  MAX_SCHULTE_HEARTS,
  readLocalBest,
  SchulteControls,
  SchulteFooter,
  SchulteGrid,
  SchulteStatusPanel,
  writeLocalBest,
  type SchulteCell,
  type SchulteMode,
  type SchulteSize,
} from "./schulte";

// ─── Schulte Table Game ────────────────────────────────────────────────────────

export function SchulteTableGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: SchulteTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const [size, setSize] = useState<SchulteSize>(5);
  const [mode, setMode] = useState<SchulteMode>("classic");
  const [grid, setGrid] = useState<SchulteCell[]>(() =>
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
  // localStorageKey / readLocalBest / writeLocalBest da duoc dua ra pham vi
  // module (xem dau file). `mergeBest` thi phai o trong component vi no dung
  // setBestByConfig — boc useCallback([]) de danh tinh khong bao gio doi, nho
  // vay dua duoc vao deps cua effect ma effect khong chay lai them lan nao.
  const mergeBest = useCallback(
    (ns: SchulteSize, nm: SchulteMode, ms: number) => {
      const key = schulteBestMapKey(ns, nm);
      setBestByConfig((prev) => {
        const cur = prev[key];
        if (cur != null && cur <= ms) return prev;
        return { ...prev, [key]: ms };
      });
      // BUG cu: dong nay chay VO DIEU KIEN, nam ngoai updater. State React thi
      // tu choi dung thoi gian cham hon, nhung localStorage van bi ghi de — nen
      // sau khi tai lai trang, ky luc that bi thay bang van cham nhat vua choi.
      // Do bang mo phong: 164/200 luot mat ky luc. Khach/offline mat vinh vien
      // vi khong co ban server de sua lai.
      //
      // Khong the chuyen writeLocalBest vao trong updater: updater phai thuan,
      // va o StrictMode no chay hai lan. Nen doc thang cache roi so.
      const cached = readLocalBest(ns, nm);
      if (cached == null || ms < cached) writeLocalBest(ns, nm, ms);
    },
    [],
  );
  const [showCenter, setShowCenter] = useState(true);
  const [hearts, setHearts] = useState(3);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongClicksRef = useRef(0);
  // Nap local cache cho moi size x mode (guest/offline) + server theo cau hinh.
  useEffect(() => {
    const local: Partial<Record<SchulteBestKey, number>> = {};
    const sizes: SchulteSize[] = [3, 4, 5, 6];
    const modes: SchulteMode[] = ["classic", "reverse", "dual"];
    for (const ns of sizes) {
      for (const nm of modes) {
        const ms = readLocalBest(ns, nm);
        if (ms != null) local[schulteBestMapKey(ns, nm)] = ms;
      }
    }
    if (Object.keys(local).length)
      setBestByConfig((prev) => ({ ...local, ...prev }));

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
    (ns: SchulteSize = size, nm: SchulteMode = mode) => {
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
      setHearts(MAX_SCHULTE_HEARTS);
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
  }, [
    seqIdx,
    sequence.length,
    status,
    size,
    mode,
    hearts,
    onComplete,
    mergeBest,
  ]);

  const handleClick = useCallback(
    async (cell: SchulteCell, idx: number) => {
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

  const target = sequence[seqIdx];
  const displayedBestMs = bestByConfig[schulteBestMapKey(size, mode)] ?? null;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(var(--neuro-panel-rgb),0.62)",
        border: "1px solid rgba(var(--neuro-purple-rgb),0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      <SchulteControls
        size={size}
        mode={mode}
        status={status}
        showCenter={showCenter}
        hearts={hearts}
        onToggleCenter={() => setShowCenter((current) => !current)}
        onSizeChange={(nextSize) => {
          setSize(nextSize);
          reset(nextSize, mode);
        }}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          reset(size, nextMode);
        }}
      />

      <SchulteStatusPanel
        elapsed={elapsed}
        displayedBestMs={displayedBestMs}
        status={status}
        mode={mode}
        size={size}
        target={target}
        seqIdx={seqIdx}
        sequenceLength={sequence.length}
      />

      <SchulteGrid
        grid={grid}
        size={size}
        showCenter={showCenter}
        flashCell={flashCell}
        foundSet={foundSet}
        status={status}
        onCellClick={handleClick}
      />

      <SchulteFooter
        status={status}
        mode={mode}
        size={size}
        saving={saving}
        onReset={() => reset()}
      />
    </div>
  );
}
