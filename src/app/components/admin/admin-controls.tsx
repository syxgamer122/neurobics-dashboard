import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import type { AxisKey, Profile } from "../../lib/api";
import { levelFromXp } from "../../lib/xp";
import { ADMIN_COLORS } from "./constants";
import { parseGrantField, type GrantAxes, type GrantMode } from "./grants";
import { ActionBtn, Panel } from "./ui";

const { green, blue, amber, red, purple } = ADMIN_COLORS;

export function AdminControls({
  selectedUser,
  currentUserId,
  busy,
  confirmDelete,
  grantAxes,
  grantXp,
  grantMode,
  setGrantAxes,
  setGrantXp,
  setGrantMode,
  setConfirmDelete,
  onApplyGrant,
  onReset,
  onDelete,
}: {
  selectedUser: Profile | null;
  currentUserId: string;
  busy: string | null;
  confirmDelete: boolean;
  grantAxes: GrantAxes;
  grantXp: string;
  grantMode: GrantMode;
  setGrantAxes: Dispatch<SetStateAction<GrantAxes>>;
  setGrantXp: (value: string) => void;
  setGrantMode: (mode: GrantMode) => void;
  setConfirmDelete: (value: boolean) => void;
  onApplyGrant: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const fillAllAxes = (amount: number) => {
    setGrantAxes({
      logic: String(amount),
      memory: String(amount),
      speed: String(amount),
      focus: String(amount),
      spatial: String(amount),
    });
  };

  const parsedGrantXp = parseGrantField(grantXp);

  return (
    <Panel accent={amber} className="!p-0 overflow-hidden">
      <div
        className="flex items-center gap-2 px-5 py-3.5"
        style={{ borderBottom: `1px solid ${amber}22` }}
      >
        <ShieldCheck size={14} style={{ color: amber }} />
        <span className="text-xs font-bold tracking-widest text-foreground font-mono">
          ADMIN CONTROLS
        </span>
        {selectedUser ? (
          <span
            className="text-xs px-2.5 py-0.5 rounded-lg ml-1"
            style={{
              background: `${purple}18`,
              color: purple,
              border: `1px solid ${purple}30`,
            }}
          >
            @{selectedUser.username}
            {selectedUser.id === currentUserId && (
              <span className="ml-1 text-xs opacity-70">(you)</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-slate-400 ml-1">
            — select a user from the table below
          </span>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="rounded-xl p-4"
          style={{
            background: `${green}0A`,
            border: `1px solid ${green}22`,
            opacity: selectedUser ? 1 : 0.4,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Plus size={13} style={{ color: green }} />
            <span
              className="text-xs font-bold tracking-wider"
              style={{ color: green }}
            >
              ADD POINTS
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            Nhập số vào từng trục. Bỏ trống nghĩa là không đụng tới. Số âm để
            trừ. Mọi trục đều bị kẹp trong 0–1000.
          </p>

          <div className="grid grid-cols-2 gap-1 mb-3">
            {(["add", "set"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setGrantMode(mode)}
                disabled={!!busy || !selectedUser}
                className="py-1.5 rounded-lg text-xs font-bold tracking-wider"
                style={
                  grantMode === mode
                    ? {
                        background: `${green}22`,
                        color: green,
                        border: `1px solid ${green}55`,
                      }
                    : {
                        background: "rgba(0,0,0,0.3)",
                        color: "#64748B",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }
                }
              >
                {mode === "add" ? "CỘNG THÊM" : "GÁN ĐÈ"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-1 mb-3">
            {[10, 50, 100, 500, 1000].map((amount) => (
              <button
                key={amount}
                onClick={() => fillAllAxes(amount)}
                disabled={!!busy || !selectedUser}
                className="py-1 rounded-md text-xs font-bold"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  color: green,
                  border: `1px solid ${green}22`,
                }}
              >
                {amount}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 mb-3">
            {(
              [
                ["logic", "LOGIC", selectedUser?.algebraic_logic_score],
                ["memory", "MEMORY", selectedUser?.memory_score],
                ["speed", "SPEED", selectedUser?.speed_score],
                ["focus", "FOCUS", selectedUser?.focus_score],
                ["spatial", "SPATIAL", selectedUser?.cfop_spatial_record],
              ] as [AxisKey, string, number | null | undefined][]
            ).map(([key, label, current]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-14 shrink-0">
                  {label}
                </span>
                <span className="text-xs text-slate-400 w-10 shrink-0 text-right">
                  {current ?? 0}
                </span>
                <input
                  type="number"
                  value={grantAxes[key]}
                  onChange={(event) =>
                    setGrantAxes((value) => ({
                      ...value,
                      [key]: event.target.value,
                    }))
                  }
                  disabled={!!busy || !selectedUser}
                  placeholder="—"
                  className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs text-foreground outline-none"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            ))}

            <div
              className="flex items-center gap-2 pt-1.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-xs w-14 shrink-0" style={{ color: amber }}>
                XP
              </span>
              <span className="text-xs text-slate-400 w-10 shrink-0 text-right">
                {selectedUser?.total_xp ?? 0}
              </span>
              <input
                type="number"
                value={grantXp}
                onChange={(event) => setGrantXp(event.target.value)}
                disabled={!!busy || !selectedUser}
                placeholder="—"
                className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs text-foreground outline-none"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${amber}33`,
                }}
              />
            </div>

            {selectedUser && (
              <div className="text-xs text-slate-500 pl-16">
                Level hiện tại {levelFromXp(selectedUser.total_xp ?? 0)}
                {parsedGrantXp !== undefined && (
                  <span style={{ color: amber }}>
                    {" → "}
                    {levelFromXp(
                      Math.max(
                        0,
                        grantMode === "set"
                          ? parsedGrantXp
                          : (selectedUser.total_xp ?? 0) + parsedGrantXp,
                      ),
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          <ActionBtn
            accent={green}
            label={grantMode === "set" ? "GÁN GIÁ TRỊ" : "CỘNG ĐIỂM"}
            icon={<Zap size={11} />}
            loading={busy === `grant:${selectedUser?.id}`}
            disabled={!!busy || !selectedUser}
            onClick={onApplyGrant}
            full
          />
        </div>

        <div
          className="rounded-xl p-4"
          style={{
            background: `${blue}0A`,
            border: `1px solid ${blue}22`,
            opacity: selectedUser ? 1 : 0.4,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw size={13} style={{ color: blue }} />
            <span
              className="text-xs font-bold tracking-wider"
              style={{ color: blue }}
            >
              RESET SCORES
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            Xóa toàn bộ điểm số về 0.
          </p>
          {selectedUser && (
            <div className="grid grid-cols-4 gap-1 mb-3 text-center">
              {[
                { key: "LOGIC", value: selectedUser.algebraic_logic_score },
                { key: "MEM", value: selectedUser.memory_score },
                { key: "SPD", value: selectedUser.speed_score },
                { key: "FOC", value: selectedUser.focus_score },
              ].map(({ key, value }) => (
                <div
                  key={key}
                  className="rounded-lg py-1.5"
                  style={{ background: "rgba(0,0,0,0.35)" }}
                >
                  <div className="text-[8px] text-slate-500">{key}</div>
                  <div className="text-xs font-bold text-foreground">
                    {(value ?? 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <ActionBtn
            accent={blue}
            label="RESET ALL TO 0"
            icon={<RotateCcw size={11} />}
            loading={busy === `reset:${selectedUser?.id}`}
            disabled={!!busy || !selectedUser}
            onClick={onReset}
            full
          />
        </div>

        <div
          className="rounded-xl p-4"
          style={{
            background: `${red}0A`,
            border: `1px solid ${red}33`,
            opacity: selectedUser ? 1 : 0.4,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={13} style={{ color: red }} />
            <span
              className="text-xs font-bold tracking-wider"
              style={{ color: red }}
            >
              DANGER ZONE
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            Xóa vĩnh viễn profile. Không thể hoàn tác.
            {selectedUser?.id === currentUserId && (
              <span style={{ color: amber }}> Đây là tài khoản của bạn!</span>
            )}
          </p>
          {!confirmDelete ? (
            <ActionBtn
              accent={red}
              label="DELETE ACCOUNT"
              icon={<Trash2 size={11} />}
              disabled={!!busy || !selectedUser}
              onClick={() => setConfirmDelete(true)}
              full
            />
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-red-300/90 text-center">
                Xóa{" "}
                <span style={{ color: red }}>@{selectedUser?.username}</span>?
                Không hoàn tác được!
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  accent="#64748B"
                  label="HỦY"
                  disabled={!!busy}
                  onClick={() => setConfirmDelete(false)}
                />
                <ActionBtn
                  accent={red}
                  label="XÓA"
                  icon={<Trash2 size={11} />}
                  loading={busy === `delete:${selectedUser?.id}`}
                  disabled={!!busy}
                  onClick={onDelete}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
