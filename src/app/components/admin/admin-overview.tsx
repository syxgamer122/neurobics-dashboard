import { useEffect, useState } from "react";
import { Activity, Cpu, Server, UserCheck, X } from "lucide-react";
import type { DataQuality, Profile } from "../../lib/api";
import { ADMIN_COLORS } from "./constants";
import { Panel } from "./ui";

const { green, blue, purple, red } = ADMIN_COLORS;

export function AdminOverview({
  loading,
  error,
  latency,
  usersCount,
  partial,
  selectedUser,
  onClearSelected,
}: {
  loading: boolean;
  error: string | null;
  latency: number;
  usersCount: number;
  partial: DataQuality;
  selectedUser: Profile | null;
  onClearSelected: () => void;
}) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setBeat((value) => (value + 1) % 100),
      1400,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Panel accent={green}>
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest text-slate-500 font-mono">
            SUPABASE STATUS
          </span>
          <Server size={13} style={{ color: green }} />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="relative flex h-2.5 w-2.5">
            {!error && (
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ background: green }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{ background: error ? red : green }}
            />
          </span>
          <span
            className="text-lg font-bold"
            style={{ color: error ? red : green }}
          >
            {error ? "ERROR" : loading ? "SYNCING" : "CONNECTED"}
          </span>
        </div>
      </Panel>

      <Panel accent={blue}>
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest text-slate-500 font-mono">
            DB LATENCY
          </span>
          <Activity size={13} style={{ color: blue }} />
        </div>
        <div className="flex items-baseline gap-1 mt-3">
          <span className="text-2xl font-bold text-foreground">{latency}</span>
          <span className="text-sm text-slate-400">ms</span>
        </div>
        <div className="mt-2 h-5 flex items-end gap-0.5 overflow-hidden">
          {Array.from({ length: 24 }).map((_, index) => {
            const height = ((Math.sin((index + beat) * 0.9) + 1) / 2) * 100;
            const spike = (index + beat) % 9 === 0 ? 100 : height;
            return (
              <div
                key={index}
                className="flex-1 rounded-sm"
                style={{
                  height: `${20 + spike * 0.8}%`,
                  background: `${blue}${spike > 80 ? "" : "55"}`,
                }}
              />
            );
          })}
        </div>
      </Panel>

      <Panel accent={green}>
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest text-slate-500 font-mono">
            TOTAL USERS
          </span>
          <Cpu size={13} style={{ color: green }} />
        </div>
        <div className="text-2xl font-bold text-foreground mt-3">
          {usersCount}
        </div>
        {partial.partial && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold"
            style={{
              background: "rgba(var(--neuro-amber-rgb),0.14)",
              border: "1px solid rgba(var(--neuro-amber-rgb),0.45)",
              color: "#FBBF24",
            }}
            title={`Nguon du phong: chi quet ${partial.scanned} nguoi choi dau tien.`}
          >
            DU LIEU MOT PHAN
          </div>
        )}
        <div className="text-xs text-slate-500 mt-1">profiles · live</div>
      </Panel>

      <Panel accent={purple}>
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest text-slate-500 font-mono">
            TARGET
          </span>
          <UserCheck size={13} style={{ color: purple }} />
        </div>
        {selectedUser ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold" style={{ color: purple }}>
                {selectedUser.username}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                streak {selectedUser.synapse_streak}d ·{" "}
                {selectedUser.algebraic_logic_score} pts
              </div>
            </div>
            <button
              onClick={onClearSelected}
              className="shrink-0 text-slate-400 hover:text-slate-300 transition-colors"
              aria-label="Bỏ chọn người dùng"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 mt-3">
            Click a row to select
          </div>
        )}
      </Panel>
    </div>
  );
}
