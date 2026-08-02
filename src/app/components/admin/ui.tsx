/**
 * Cac manh giao dien dung lai trong admin control-plane.
 * Thuan trinh bay: khong goi API, khong giu state cua panel.
 */
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Copy, Check, Loader2 } from "lucide-react";

export function Panel({
  children,
  className = "",
  accent = "#00FF9C",
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{
        background: "rgba(8,14,24,0.72)",
        border: `1px solid ${accent}22`,
        backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.7778))",
        WebkitBackdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.7778))",
        boxShadow:
          "0 4px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {children}
    </div>
  );
}

export function ActionBtn({
  label,
  accent,
  icon,
  onClick,
  loading = false,
  disabled = false,
  full = false,
}: {
  label: string;
  accent: string;
  icon?: ReactNode;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-150 disabled:opacity-40 ${full ? "w-full" : ""}`}
      style={{
        background: hover && !disabled ? `${accent}22` : `${accent}10`,
        color: accent,
        border: `1px solid ${accent}33`,
        boxShadow: hover && !disabled ? `0 0 18px ${accent}30` : "none",
      }}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function EnvField({
  label,
  value,
  revealed,
  onToggle,
  onCopy,
  copied,
  mask,
  accent,
}: {
  label: string;
  value: string;
  revealed: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  mask: (s: string) => string;
  accent: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs text-slate-500 mb-1.5 tracking-wider">
        {label}
      </div>
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${accent}18`,
        }}
      >
        <span
          className="flex-1 text-xs truncate"
          style={{ color: revealed ? accent : "#64748B" }}
        >
          {revealed ? value : mask(value)}
        </span>
        <button
          onClick={onToggle}
          className="text-slate-500 hover:text-white transition-colors shrink-0"
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          onClick={onCopy}
          className="text-slate-500 hover:text-white transition-colors shrink-0"
        >
          {copied ? (
            <Check size={13} style={{ color: accent }} />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}
