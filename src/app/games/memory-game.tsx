import { useState, useEffect, useCallback, useRef } from "react";
import { Brain, CheckCircle, Loader2, RefreshCw, Star } from "lucide-react";
import { useLang } from "../lib/i18n";
import { shuffleArray } from "../lib/sudoku-gen";
import type { MemoryTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Memory Matrix Game ──────────────────────────────────────────────────────

export function MemoryMatrixGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: MemoryTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  const MAX_HEARTS = 3;

  const [level, setLevel] = useState(1);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const heartsRef = useRef(MAX_HEARTS);
  const wrongClicksRef = useRef(0);
  const [status, setStatus] = useState<
    "idle" | "memorize" | "recall" | "success" | "fail" | "done"
  >("idle");
  const [targets, setTargets] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  // Khong giu wrongClicks trong state: khong cho nao render doc no, va so lieu
  // gui len server lay tu wrongClicksRef (chuan hon vi khong tre mot nhip).
  // Giu ca hai chi tao them render thua va nguy co lech so lieu.

  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const maxClearedRef = useRef(0);
  // Wall-clock UI still uses startRef; scoring telemetry uses recall-only ms
  // so memorize flash delays do not inflate timeMs.
  const recallMsRef = useRef(0);
  const recallStartRef = useRef<number | null>(null);

  /** Huỷ mọi hẹn giờ đang treo để ván cũ không can thiệp vào ván mới. */
  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  /** setTimeout có theo dõi, tự gỡ khỏi danh sách sau khi chạy xong. */
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
  }, []);

  const gridSize = Math.min(6, Math.max(3, Math.floor(2 + level / 3)));
  const targetCount = Math.min(15, 2 + Math.floor(level / 1.5));
  const totalCells = gridSize * gridSize;

  const generateLevel = useCallback(() => {
    clearTimers();
    // Close any open recall window before flipping back to memorize.
    if (recallStartRef.current != null) {
      recallMsRef.current += Date.now() - recallStartRef.current;
      recallStartRef.current = null;
    }
    const newTargets = shuffleArray(
      Array.from({ length: totalCells }, (_, i) => i),
    ).slice(0, targetCount);
    setTargets(newTargets);
    setSelected([]);
    setStatus("memorize");

    if (level === 1 && !startRef.current) {
      onPlayStart?.();
      startRef.current = Date.now();
      recallMsRef.current = 0;
      recallStartRef.current = null;
      intervalRef.current = setInterval(
        () => setElapsed(Date.now() - (startRef.current ?? Date.now())),
        100,
      );
    }

    later(
      () => {
        setStatus((prev) => {
          if (prev !== "memorize") return prev;
          recallStartRef.current = Date.now();
          return "recall";
        });
      },
      1500 + targetCount * 100,
    );
  }, [level, targetCount, totalCells, clearTimers, later, onPlayStart]);

  const reset = () => {
    clearTimers();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    maxClearedRef.current = 0;
    recallMsRef.current = 0;
    recallStartRef.current = null;
    setLevel(1);
    heartsRef.current = MAX_HEARTS;
    wrongClicksRef.current = 0;
    setHearts(MAX_HEARTS);
    setStatus("idle");
    setElapsed(0);
    startRef.current = null;
  };

  const handleCellClick = (idx: number) => {
    if (status !== "recall" || selected.includes(idx)) return;

    const newSelected = [...selected, idx];
    setSelected(newSelected);

    if (!targets.includes(idx)) {
      // Dung ref: hai click sai trong cung frame khong doc trung gia tri cu.
      wrongClicksRef.current += 1;
      heartsRef.current = Math.max(0, heartsRef.current - 1);
      const newHearts = heartsRef.current;
      setHearts(newHearts);
      // Close recall window before fail pause.
      if (recallStartRef.current != null) {
        recallMsRef.current += Date.now() - recallStartRef.current;
        recallStartRef.current = null;
      }
      setStatus("fail");

      if (newHearts <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        later(() => {
          setStatus("done");
          setSaving(true);
          void onComplete({
            // CHI tinh pha recall (da tru thoi gian memorize) — anticheat phai
            // dung nguong recall-only, khong phai nguong wall-clock ca van.
            timeMs: recallMsRef.current,
            // KHÔNG nâng sàn lên 1 nữa: thua ngay cấp 1 nghĩa là chưa vượt
            // được cấp nào, phải được chấm 0 thay vì được tính như đã qua cấp 1.
            // (Truoc day van gui Math.max(1, ...) — trai nguoc chinh comment nay
            //  — khien inspectMemory chia cho 1 va reject 422 oan.)
            maxLevel: maxClearedRef.current,
            clearedLevels: maxClearedRef.current,
            failed: true,
            wrongClicks: wrongClicksRef.current,
          })
            .catch((err) => {
              logError("Memory completion: onComplete failed:", err);
            })
            .finally(() => setSaving(false));
        }, 1000);
      } else {
        later(() => generateLevel(), 1000);
      }
      return;
    }

    if (newSelected.length === targets.length) {
      if (recallStartRef.current != null) {
        recallMsRef.current += Date.now() - recallStartRef.current;
        recallStartRef.current = null;
      }
      setStatus("success");
      maxClearedRef.current = Math.max(maxClearedRef.current, level);
      later(() => setLevel((l) => l + 1), 600);
    }
  };

  useEffect(() => {
    if (level > 1) {
      generateLevel();
    }
  }, [level, generateLevel]);

  // Dọn sạch khi rời trang: nếu không, đồng hồ đếm và các hẹn giờ vẫn chạy tiếp.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0
      ? `${m}:${String(s % 60).padStart(2, "0")}`
      : `0:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "rgba(var(--neuro-panel-rgb),0.62)",
        border: "1px solid rgba(var(--neuro-red-rgb),0.2)",
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
      }}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{
              color: "#F43F5E",
            }}
          >
            {t.mem_tag}
          </div>
          <div className="text-base font-bold text-foreground">
            Memory Matrix
          </div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(var(--neuro-red-rgb),0.18)",
            color: "#F43F5E",
            border: "1px solid rgba(var(--neuro-red-rgb),0.28)",
          }}
        >
          <Brain size={16} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{
            background: "rgba(var(--neuro-red-rgb),0.12)",
            border: "1px solid rgba(var(--neuro-red-rgb),0.25)",
          }}
        >
          <Star size={11} style={{ color: "#F43F5E" }} />
          <span
            className="text-xs font-bold"
            style={{
              color: "#F43F5E",
            }}
          >
            +{level} MEMORY
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          role="status"
          aria-live="polite"
          aria-atomic="true"
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
                    ? "drop-shadow(0 0 4px rgba(var(--neuro-red-rgb),0.6))"
                    : "none",
              }}
            >
              ❤️
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400 mb-0.5">{t.time_label}</span>
          <div
            className="text-3xl font-bold tabular-nums font-mono"
            style={{
              color: status === "done" ? "#10B981" : "#F43F5E",
              textShadow:
                status === "done"
                  ? "0 0 24px rgba(var(--neuro-green-rgb),0.5)"
                  : "0 0 18px rgba(var(--neuro-red-rgb),0.4)",
            }}
          >
            {fmtTime(elapsed)}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-400 mb-0.5">{t.level_label}</span>
          <span
            className="text-4xl font-bold tabular-nums font-mono"
            style={{
              color: "#F43F5E",
              textShadow: "0 0 20px rgba(var(--neuro-red-rgb),0.55)",
            }}
          >
            {level}
          </span>
        </div>
      </div>

      {status === "idle" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center py-10"
          style={{ minHeight: 280 }}
        >
          <div className="text-sm text-slate-400 text-center mb-6 leading-relaxed">
            {t.mem_intro_1}
            <br />
            {t.mem_intro_2}
          </div>
          <button
            onClick={generateLevel}
            className="px-8 py-3 rounded-xl text-sm font-bold tracking-widest transition-all duration-200 hover:scale-105 font-mono"
            style={{
              background: "rgba(var(--neuro-red-rgb),0.15)",
              color: "#F43F5E",
              border: "1px solid rgba(var(--neuro-red-rgb),0.4)",
              boxShadow: "0 0 20px rgba(var(--neuro-red-rgb),0.2)",
            }}
          >
            {t.mem_start}
          </button>
        </div>
      ) : status === "done" ? (
        <div
          className="mt-6 flex flex-col items-center justify-center py-10"
          style={{ minHeight: 280 }}
        >
          <CheckCircle size={48} className="text-emerald-400 mb-4" />
          <div className="text-lg font-bold text-foreground mb-1">
            {t.game_over}
          </div>
          <div className="text-sm text-slate-400">
            {t.mem_max_level}:{" "}
            <span className="text-[#F43F5E]">
              {Math.max(1, maxClearedRef.current)}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="mt-6 mx-auto relative"
          style={{ width: "100%", maxWidth: 320 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              gap: 8,
              aspectRatio: "1",
              pointerEvents: status === "recall" ? "auto" : "none",
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
                bg = "rgba(var(--neuro-red-rgb),0.8)";
                border = "1px solid rgba(var(--neuro-red-rgb),1)";
                shadow = "0 0 15px rgba(var(--neuro-red-rgb),0.6)";
              } else if (status === "recall" || status === "success") {
                if (isWrong) {
                  bg = "rgba(var(--neuro-red-rgb),0.4)";
                  border = "1px solid rgba(var(--neuro-red-rgb),0.8)";
                } else if (isSelected) {
                  bg = "rgba(var(--neuro-green-rgb),0.5)";
                  border = "1px solid rgba(var(--neuro-green-rgb),0.8)";
                  shadow = "0 0 10px rgba(var(--neuro-green-rgb),0.4)";
                  transform = "scale(0.92)";
                } else {
                  bg = "rgba(255,255,255,0.05)";
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={`${t.cell_label ?? "Cell"} ${idx + 1}`}
                  aria-pressed={isSelected}
                  disabled={status !== "recall"}
                  onClick={() => handleCellClick(idx)}
                  className="rounded-lg transition-all duration-200"
                  style={{
                    background: bg,
                    border: border,
                    boxShadow: shadow,
                    transform: transform,
                    cursor:
                      status === "recall" && !isSelected
                        ? "pointer"
                        : "default",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {saving && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      {status !== "idle" && (
        <button
          disabled={saving}
          onClick={reset}
          className="mt-6 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-125"
          style={{
            background: "rgba(var(--neuro-red-rgb),0.1)",
            color: "#F43F5E",
            border: "1px solid rgba(var(--neuro-red-rgb),0.25)",
          }}
        >
          <RefreshCw size={12} /> {t.abort_restart}
        </button>
      )}
    </div>
  );
}
