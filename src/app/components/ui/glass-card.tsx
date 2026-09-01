import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  accent = "#00D4FF",
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "rgba(var(--neuro-panel-rgb), 0.85)",
        border: `1px solid ${accent}22`,
        backdropFilter: "blur(var(--glass-blur, 20px))",
        WebkitBackdropFilter: "blur(var(--glass-blur, 20px))",
        boxShadow:
          "0 10px 30px -10px rgba(0,0,0,0.1), 0 0 20px -5px rgba(6, 182, 212, 0.08)",
      }}
    >
      {children}
    </div>
  );
}
