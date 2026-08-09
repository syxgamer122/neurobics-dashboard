import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight, Zap } from "lucide-react";

export function GameTile({
  accent,
  icon,
  tag,
  title,
  desc,
  playLabel,
  onPlay,
}: {
  accent: string;
  icon: ReactNode;
  tag: string;
  title: string;
  desc: string;
  playLabel?: string;
  onPlay: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onPlay}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="text-left rounded-2xl p-6 flex flex-col transition-all duration-200"
      style={{
        background: "rgba(var(--neuro-panel-rgb),0.62)",
        border: `1px solid ${accent}${hover ? "55" : "22"}`,
        backdropFilter: "blur(var(--glass-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
        boxShadow: hover
          ? `0 0 34px ${accent}33`
          : "0 4px 44px rgba(0,0,0,0.45)",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `${accent}22`,
            color: accent,
            border: `1px solid ${accent}44`,
          }}
        >
          {icon}
        </div>
        <ChevronRight
          size={18}
          style={{
            color: accent,
            transform: hover ? "translateX(3px)" : "none",
            transition: "transform 0.2s",
          }}
        />
      </div>
      <div
        className="text-xs tracking-[0.2em] mt-4 font-mono"
        style={{ color: accent }}
      >
        {tag}
      </div>
      <div className="text-lg font-bold text-white mt-1">{title}</div>
      <div className="text-xs text-slate-400 mt-2 leading-relaxed">{desc}</div>
      <div
        className="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-wider"
        style={{ color: accent }}
      >
        <Zap size={12} /> {playLabel ?? "PLAY NOW"}
      </div>
    </button>
  );
}
