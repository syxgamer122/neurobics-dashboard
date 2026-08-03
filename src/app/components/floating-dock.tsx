import { useState } from "react";
import { LayoutDashboard, Gamepad2, History, UserCog, Terminal } from "lucide-react";
import { useLang } from "../lib/i18n";

export type DockPage = "dashboard" | "play" | "history" | "profile" | "god";

interface DockItem {
  id: DockPage;
  icon: typeof LayoutDashboard;
  accent: string; // rgb triplet
}

const ITEMS: DockItem[] = [
  { id: "dashboard", icon: LayoutDashboard, accent: "0,212,255" },
  { id: "play", icon: Gamepad2, accent: "168,85,247" },
  { id: "history", icon: History, accent: "16,185,129" },
  { id: "profile", icon: UserCog, accent: "245,158,11" },
  { id: "god", icon: Terminal, accent: "0,255,156" },
];

export function FloatingDock({
  active,
  onSelect,
}: {
  active: DockPage;
  onSelect: (page: DockPage) => void;
}) {
  const [hovered, setHovered] = useState<DockPage | null>(null);
  const { t } = useLang();

  const labels: Record<DockPage, string> = {
    dashboard: t.dock_dashboard,
    play: t.dock_arena,
    history: t.dock_history ?? "Lịch sử",
    profile: t.dock_profile,
    god: t.dock_admin,
  };

  return (
    <div
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[100vw] -translate-x-1/2 pointer-events-none"
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      <div
        className="mx-auto flex w-fit max-w-full items-center gap-1 sm:gap-2 rounded-2xl px-2 sm:px-3 py-2 sm:py-2.5 pointer-events-auto"
        style={{
          background: "rgba(10,16,36,0.72)",
          border: "1px solid rgba(0,212,255,0.14)",
          backdropFilter: "blur(calc(var(--glass-blur, 18px) * 1.2222))",
          WebkitBackdropFilter: "blur(calc(var(--glass-blur, 18px) * 1.2222))",
          boxShadow:
            "0 10px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const isHovered = hovered === item.id;
          return (
            <div key={item.id} className="relative flex flex-col items-center">
              {/* Tooltip desktop only — hover khong dung duoc tren cam ung */}
              <div
                className="absolute bottom-full mb-3 hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-xs tracking-wider transition-all duration-200 sm:block"
                style={{
                  background: "rgba(5,10,24,0.95)",
                  color: `rgb(${item.accent})`,
                  border: `1px solid rgba(${item.accent},0.35)`,
                  boxShadow: `0 0 18px rgba(${item.accent},0.2)`,
                  opacity: isHovered ? 1 : 0,
                  transform: isHovered ? "translateY(0)" : "translateY(6px)",
                  pointerEvents: "none",
                }}
              >
                {labels[item.id]}
                <span
                  className="absolute left-1/2 top-full -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `5px solid rgba(${item.accent},0.35)`,
                  }}
                />
              </div>

              <button
                type="button"
                aria-label={labels[item.id]}
                aria-current={isActive ? "page" : undefined}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(item.id)}
                className="flex h-12 w-12 sm:h-11 sm:w-11 items-center justify-center rounded-xl transition-all duration-200"
                style={{
                  background: isActive
                    ? `rgba(${item.accent},0.16)`
                    : isHovered
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                  border: isActive
                    ? `1px solid rgba(${item.accent},0.4)`
                    : "1px solid transparent",
                  boxShadow: isActive
                    ? `0 0 22px rgba(${item.accent},0.35)`
                    : "none",
                  transform: isHovered ? "translateY(-3px)" : "translateY(0)",
                }}
              >
                <Icon
                  size={19}
                  style={{
                    color:
                      isActive || isHovered
                        ? `rgb(${item.accent})`
                        : "#64748b",
                    filter: isActive
                      ? `drop-shadow(0 0 6px rgb(${item.accent}))`
                      : "none",
                    transition: "color 0.2s, filter 0.2s",
                  }}
                />
              </button>

              <div
                className="absolute -bottom-1.5 h-1 w-1 rounded-full transition-all duration-200"
                style={{
                  background: `rgb(${item.accent})`,
                  boxShadow: `0 0 8px rgb(${item.accent})`,
                  opacity: isActive ? 1 : 0,
                  transform: isActive ? "scale(1)" : "scale(0.3)",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
