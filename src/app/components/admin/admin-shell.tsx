import type { ReactNode } from "react";
import { ChevronLeft, Database, ShieldCheck } from "lucide-react";
import { ADMIN_COLORS } from "./constants";

const { green, blue } = ADMIN_COLORS;

export function AdminShell({
  onExit,
  children,
}: {
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen text-slate-100"
      style={{ background: "#04060D" }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            top: "-10%",
            left: "-6%",
            width: 620,
            height: 620,
            background: `radial-gradient(circle, ${green}14 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: "-12%",
            right: "-8%",
            width: 560,
            height: 560,
            background: `radial-gradient(circle, ${blue}12 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(${green}06 1px, transparent 1px), linear-gradient(90deg, ${green}06 1px, transparent 1px)`,
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div
        className="relative z-10 flex items-center justify-between px-8 py-4"
        style={{ borderBottom: `1px solid ${green}1A` }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft size={14} /> EXIT
          </button>
          <div className="h-4 w-px" style={{ background: `${green}22` }} />
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: `${green}14`,
              border: `1px solid ${green}33`,
              boxShadow: `0 0 20px ${green}22`,
            }}
          >
            <Database size={16} style={{ color: green }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-[0.18em] font-mono">
              ADMIN PANEL · DB CONTROL
            </div>
            <div className="text-xs text-slate-500 tracking-wider">
              SUPER ADMIN — HỮU MẠNH
            </div>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded"
          style={{
            background: `${green}12`,
            color: green,
            border: `1px solid ${green}30`,
          }}
        >
          <ShieldCheck size={11} /> ROOT ACCESS
        </span>
      </div>

      {children}
    </div>
  );
}
