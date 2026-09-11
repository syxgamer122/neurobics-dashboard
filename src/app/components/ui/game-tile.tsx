import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowRight, Play } from "lucide-react";

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
      type="button"
      onClick={onPlay}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative text-left rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 overflow-hidden cursor-pointer"
      style={{
        background: hover
          ? "linear-gradient(145deg, rgba(var(--neuro-panel-rgb), 0.95), rgba(var(--neuro-panel-rgb), 0.82))"
          : "linear-gradient(145deg, rgba(var(--neuro-panel-rgb), 0.88), rgba(var(--neuro-panel-rgb), 0.7))",
        border: `1px solid ${hover ? accent : "rgba(var(--neuro-muted-rgb, 100, 116, 139), 0.18)"}`,
        backdropFilter: "blur(var(--glass-blur, 20px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 20px))",
        boxShadow: hover
          ? `0 16px 36px -8px ${accent}33, 0 0 20px -2px ${accent}22`
          : "0 4px 16px -4px rgba(0,0,0,0.06), 0 2px 6px -2px rgba(0,0,0,0.04)",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
      }}
    >
      {/* Top subtle glow line on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />

      <div>
        {/* Top bar: Icon & Tag Chip */}
        <div className="flex items-center justify-between gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${accent}28, ${accent}12)`,
              color: accent,
              border: `1px solid ${accent}44`,
              boxShadow: `0 4px 14px ${accent}22`,
            }}
          >
            {icon}
          </div>

          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider font-mono uppercase"
            style={{
              background: `${accent}18`,
              color: accent,
              border: `1px solid ${accent}33`,
            }}
          >
            {tag}
          </span>
        </div>

        {/* Title & Description */}
        <h3 className="text-base sm:text-lg font-bold text-foreground mt-4 tracking-tight group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
          {desc}
        </p>
      </div>

      {/* Bottom Action Footer */}
      <div
        className="mt-5 pt-3.5 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between text-xs font-bold tracking-wider transition-all duration-200"
        style={{ color: accent }}
      >
        <span className="flex items-center gap-1.5 font-mono">
          <Play size={11} className="fill-current" />
          {playLabel ?? "CHƠI NGAY"}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 group-hover:translate-x-1"
          style={{
            background: `${accent}20`,
            color: accent,
          }}
        >
          <ArrowRight size={14} />
        </div>
      </div>
    </button>
  );
}
