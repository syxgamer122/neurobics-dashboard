import type { ReactNode } from "react";

export function Label({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  return (
    <div
      className="text-[11px] tracking-[0.2em] uppercase"
      style={{ fontFamily: "'JetBrains Mono', monospace", color }}
    >
      {children}
    </div>
  );
}


