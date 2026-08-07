import { CheckCircle } from "lucide-react";
import { useLang } from "../../lib/i18n";
import {
  formatSchulteTime,
  type SchulteCell,
  type SchulteGameStatus,
  type SchulteMode,
  type SchulteSize,
} from "./model";

export function SchulteStatusPanel({
  elapsed,
  displayedBestMs,
  status,
  mode,
  size,
  target,
  seqIdx,
  sequenceLength,
}: {
  elapsed: number;
  displayedBestMs: number | null;
  status: SchulteGameStatus;
  mode: SchulteMode;
  size: SchulteSize;
  target: SchulteCell | undefined;
  seqIdx: number;
  sequenceLength: number;
}) {
  const { t } = useLang();
  const progress = seqIdx / sequenceLength;

  return (
    <>
      {/* Timer + "Find N" */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400 mb-0.5">{t.time_label}</span>
          <div
            className="text-3xl font-bold tabular-nums font-mono"
            style={{
              color: status === "done" ? "#10B981" : "#A855F7",
              textShadow:
                status === "done"
                  ? "0 0 24px rgba(16,185,129,0.5)"
                  : "0 0 18px rgba(168,85,247,0.4)",
            }}
          >
            {formatSchulteTime(elapsed)}
          </div>
          {displayedBestMs !== null && (
            <span
              className="text-xs mt-0.5"
              style={{
                color: "#475569",
              }}
            >
              {t.best_label} {formatSchulteTime(displayedBestMs)}
            </span>
          )}
        </div>

        {status !== "done" ? (
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 mb-0.5">
              {status === "idle" ? t.start_with_label : t.find_label}
            </span>
            <div className="flex items-center gap-2">
              {mode === "dual" && target && (
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: target.color === "red" ? "#F43F5E" : "#A855F7",
                    boxShadow: `0 0 8px ${target.color === "red" ? "rgba(244,63,94,0.7)" : "rgba(168,85,247,0.7)"}`,
                  }}
                />
              )}
              <span
                className="text-4xl font-bold tabular-nums font-mono"
                style={{
                  color: target?.color === "red" ? "#F43F5E" : "#A855F7",
                  textShadow: `0 0 20px ${target?.color === "red" ? "rgba(244,63,94,0.65)" : "rgba(168,85,247,0.65)"}`,
                }}
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
            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle size={13} /> {t.complete}
            </span>
            <span className="text-xs text-slate-400">
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
            boxShadow: "0 0 8px rgba(168,85,247,0.5)",
          }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-slate-400">0</span>
        <span className="text-xs text-slate-400">
          {seqIdx} / {sequenceLength}
        </span>
        <span className="text-xs text-slate-400">{sequenceLength}</span>
      </div>
    </>
  );
}
