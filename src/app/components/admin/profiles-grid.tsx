import { AlertTriangle, Database, Loader2, RefreshCw } from "lucide-react";
import { totalSessions, type Profile } from "../../lib/api";
import { ADMIN_COLORS } from "./constants";
import { Panel } from "./ui";

const { green, blue, amber, red, purple } = ADMIN_COLORS;

export function ProfilesGrid({
  rows,
  loading,
  error,
  selectedUser,
  onRefresh,
  onSelect,
}: {
  rows: Profile[];
  loading: boolean;
  error: string | null;
  selectedUser: Profile | null;
  onRefresh: () => void;
  onSelect: (profile: Profile) => void;
}) {
  return (
    <Panel accent={green} className="lg:col-span-2 !p-0 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: `1px solid ${green}18` }}
      >
        <div className="flex items-center gap-2">
          <Database size={14} style={{ color: green }} />
          <span className="text-xs font-bold tracking-widest text-foreground font-mono">
            LIVE DATA GRID
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: `${green}12`, color: green }}
          >
            public.profiles
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
            <Loader2
              size={16}
              className="animate-spin"
              style={{ color: green }}
            />{" "}
            Querying…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-16 text-xs text-center px-6">
            <AlertTriangle size={20} style={{ color: red }} />
            <span style={{ color: red }}>Query failed</span>
            <span className="text-slate-500 max-w-md break-words">{error}</span>
            <button
              onClick={onRefresh}
              className="mt-2 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: `${green}12`,
                color: green,
                border: `1px solid ${green}30`,
              }}
            >
              RETRY
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">
            No rows.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: "rgba(0,255,156,0.04)" }}>
                {[
                  "Username",
                  "Logic",
                  "Memory",
                  "Speed",
                  "Focus",
                  "Streak",
                  "Sessions",
                ].map((column) => (
                  <th
                    key={column}
                    className="px-4 py-2.5 text-xs tracking-wider whitespace-nowrap"
                    style={{
                      color: green,
                      borderBottom: `1px solid ${green}18`,
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isAdminRow = row.role === "admin";
                const isSelected = selectedUser?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(row)}
                    className="cursor-pointer transition-colors duration-100"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isSelected ? `${purple}18` : "transparent",
                    }}
                    onMouseEnter={(event) => {
                      if (!isSelected) {
                        event.currentTarget.style.background =
                          "rgba(255,255,255,0.03)";
                      }
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = isSelected
                        ? `${purple}18`
                        : "transparent";
                    }}
                  >
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              background: purple,
                              boxShadow: `0 0 6px ${purple}`,
                            }}
                          />
                        )}
                        <span
                          style={{
                            color: isAdminRow
                              ? amber
                              : isSelected
                                ? purple
                                : "#E2E8F4",
                          }}
                        >
                          {row.username}
                          {isAdminRow && (
                            <span
                              className="ml-1.5 text-xs"
                              style={{ color: green }}
                            >
                              ★
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground">
                      {(row.algebraic_logic_score ?? 0).toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-2.5 text-xs"
                      style={{ color: "#94a3b8" }}
                    >
                      {(row.memory_score ?? 0).toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-2.5 text-xs"
                      style={{ color: "#94a3b8" }}
                    >
                      {(row.speed_score ?? 0).toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-2.5 text-xs"
                      style={{ color: "#94a3b8" }}
                    >
                      {(row.focus_score ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: blue }}>
                      {row.synapse_streak}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {totalSessions(row)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
