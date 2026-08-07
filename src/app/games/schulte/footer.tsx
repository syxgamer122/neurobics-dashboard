import { Loader2, RefreshCw } from "lucide-react";
import { useLang } from "../../lib/i18n";
import type { SchulteGameStatus, SchulteMode, SchulteSize } from "./model";

export function SchulteFooter({
  status,
  mode,
  size,
  saving,
  onReset,
}: {
  status: SchulteGameStatus;
  mode: SchulteMode;
  size: SchulteSize;
  saving: boolean;
  onReset: () => void;
}) {
  const { t } = useLang();

  return (
    <>
      {/* Idle hint */}
      {status === "idle" && (
        <div className="mt-3 text-xs text-center text-slate-500">
          {mode === "dual"
            ? t.idle_dual
            : mode === "reverse"
              ? t.idle_reverse(size * size)
              : t.idle_classic(size * size)}
        </div>
      )}

      {saving && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={11} className="animate-spin" /> {t.saving}
        </div>
      )}

      <button
        disabled={saving}
        onClick={() => onReset()}
        className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 hover:brightness-125"
        style={{
          background: "rgba(168,85,247,0.14)",
          color: "#A855F7",
          border: "1px solid rgba(168,85,247,0.25)",
        }}
      >
        <RefreshCw size={12} /> {t.new_game}
      </button>
    </>
  );
}
