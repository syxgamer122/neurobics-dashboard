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
      className="text-xs tracking-[0.2em] uppercase font-mono"
      style={{ color }}
    >
      {children}
    </div>
  );
}
