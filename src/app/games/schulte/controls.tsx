import { Focus, Star } from "lucide-react";
import { useLang } from "../../lib/i18n";
import {
  MAX_SCHULTE_HEARTS,
  type SchulteGameStatus,
  type SchulteMode,
  type SchulteSize,
} from "./model";

const SCHULTE_SIZES: SchulteSize[] = [3, 4, 5, 6];

export function SchulteControls({
  size,
  mode,
  status,
  showCenter,
  hearts,
  onToggleCenter,
  onSizeChange,
  onModeChange,
}: {
  size: SchulteSize;
  mode: SchulteMode;
  status: SchulteGameStatus;
  showCenter: boolean;
  hearts: number;
  onToggleCenter: () => void;
  onSizeChange: (size: SchulteSize) => void;
  onModeChange: (mode: SchulteMode) => void;
}) {
  const { t } = useLang();
  const modes: Array<{ id: SchulteMode; label: string; hint: string }> = [
    { id: "classic", label: t.classic, hint: t.hint_classic(size * size) },
    { id: "reverse", label: t.reverse, hint: t.hint_reverse(size * size) },
    { id: "dual", label: t.dual, hint: t.hint_dual },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{
              color: "#A855F7",
            }}
          >
            {t.focus_training}
          </div>
          <div className="text-base font-bold text-white">Schulte Table</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleCenter()}
            title="Toggle center fixation"
            className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all duration-150"
            style={{
              background: showCenter
                ? "rgba(168,85,247,0.18)"
                : "rgba(255,255,255,0.04)",
              color: showCenter ? "#A855F7" : "#475569",
              border: `1px solid ${showCenter ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <Focus size={11} /> {t.fixation}
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(168,85,247,0.18)",
              color: "#A855F7",
              border: "1px solid rgba(168,85,247,0.28)",
            }}
          >
            <Focus size={16} />
          </div>
        </div>
      </div>

      {/* Size selector */}
      <div className="flex items-center gap-2.5 mt-3">
        <span className="text-xs text-slate-400 w-10 shrink-0">
          {t.size_label}
        </span>
        <div className="flex gap-1.5">
          {SCHULTE_SIZES.map((s) => {
            const active = size === s;
            return (
              <button
                key={s}
                onClick={() => onSizeChange(s)}
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
                  boxShadow: active ? "0 0 12px rgba(168,85,247,0.28)" : "none",
                }}
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
          {modes.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onModeChange(m.id)}
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
                  boxShadow: active ? "0 0 12px rgba(168,85,247,0.28)" : "none",
                }}
              >
                {m.label}
                {active && (
                  <span
                    className="hidden sm:inline"
                    style={{ fontSize: 11, opacity: 0.7 }}
                  >
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
            border: "1px solid rgba(168,85,247,0.25)",
          }}
        >
          <Star size={11} style={{ color: "#A855F7" }} />
          <span
            className="text-xs font-bold"
            style={{
              color: "#A855F7",
            }}
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
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${hearts}/${MAX_SCHULTE_HEARTS} ${t.heart_full ?? "lives"}`}
        >
          {Array.from({ length: MAX_SCHULTE_HEARTS }).map((_, i) => (
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
                    : "none",
              }}
            >
              <span aria-hidden="true">❤️</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
