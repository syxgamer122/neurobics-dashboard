import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database,
  Eye,
  EyeOff,
  Copy,
  Check,
  Activity,
  Terminal,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Server,
  Cpu,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  Plus,
  RotateCcw,
  Trash2,
  Zap,
  UserCheck,
  X,
} from "lucide-react";
import {
  fetchLeaderboard,
  dataQuality,
  type DataQuality,
  adminApplyGrant,
  adminResetScores,
  adminDeleteUser,
  AXIS_COLUMNS,
  type AxisKey,
  type Profile,
} from "../lib/api";
import { levelFromXp } from "../lib/xp";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";


const consoleBoot = [
  "[sys] neurobics-db admin control-plane v2.5.0",
  "[auth] super_admin session verified :: Hữu Mạnh",
  "[pg] connection pool established (max=100)",
  "[rls] row-level-security policies loaded",
];

export function AdminPanel({
  onExit,
  profile,
  onProfileChange,
  onAccountDeleted,
}: {
  onExit: () => void;
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  onAccountDeleted: () => void;
}) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealUrl, setRevealUrl] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [latency, setLatency] = useState(12);
  // Nhanh fallback chi quet duoc 200 dong dau => top that co the vang mat.
  // Hien badge thay vi de bang xep hang sai mot cach im lang.
  const [partial, setPartial] = useState<DataQuality>({
    partial: false,
    scanned: 0,
  });
  const [beat, setBeat] = useState(0);
  const [log, setLog] = useState<string[]>(consoleBoot);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const isAdmin = profile.role === "admin";

  const SUPABASE_URL = `https://${projectId}.supabase.co`;
  const ANON_KEY = publicAnonKey;

  const green = "#00FF9C";
  const blue = "#00D4FF";
  const amber = "#F59E0B";
  const red = "#F43F5E";
  const purple = "#A855F7";

  const pushLog = useCallback(
    (line: string) =>
      setLog((l) => [...l.slice(-60), `[${new Date().toLocaleTimeString("en-GB")}] ${line}`]),
    [],
  );

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const data = await fetchLeaderboard();
      setLatency(Math.max(1, Math.round(performance.now() - t0)));
      setRows(data);
      setPartial({ ...dataQuality.leaderboard });
      if (dataQuality.leaderboard.partial) {
        pushLog(
          `WARN :: fallback quet toi da ${dataQuality.leaderboard.scanned} dong — thu hang co the thieu nguoi`,
        );
      }
      pushLog(`SELECT * FROM profiles — 200 OK (${data.length} rows, ${Math.round(performance.now() - t0)}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      pushLog(`ERR :: SELECT FROM profiles — ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [pushLog]);

  useEffect(() => {
    if (isAdmin) fetchProfiles();
    else setLoading(false);
  }, [fetchProfiles, isAdmin]);

  useEffect(() => {
    const i = setInterval(() => setBeat((b) => (b + 1) % 100), 1400);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const mask = (s: string) => "•".repeat(Math.min(s.length, 44));
const EMPTY_GRANT: Record<AxisKey, string> = {
  logic: "", memory: "", speed: "", focus: "", spatial: "",
};

const [grantAxes, setGrantAxes] = useState<Record<AxisKey, string>>(EMPTY_GRANT);
const [grantXp, setGrantXp] = useState("");
const [grantMode, setGrantMode] = useState<"add" | "set">("add");

  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (!isAdmin || busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog(`ERR :: ${key} — ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  // ── Actions on selectedUser ──────────────────────────────────────────────

  const target = selectedUser;

  const parseField = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

/** Điền cùng một số vào cả 5 ô trục. */
const fillAllAxes = (amount: number) => {
  setGrantAxes({
    logic: String(amount), memory: String(amount), speed: String(amount),
    focus: String(amount), spatial: String(amount),
  });
};

const handleApplyGrant = () => {
  if (!target) return;

  const axes: Partial<Record<AxisKey, number>> = {};
  for (const key of Object.keys(grantAxes) as AxisKey[]) {
    const value = parseField(grantAxes[key]);
    if (value !== undefined) axes[key] = value;
  }

  const xp = parseField(grantXp);
  const touched = Object.keys(axes).length;
  if (touched === 0 && xp === undefined) {
    pushLog("SKIP :: không có trường nào được nhập");
    return;
  }

  const isSelf = target.id === profile.id;
  runAction(`grant:${target.id}`, async () => {
    const updated = await adminApplyGrant(target.id, { axes, xp, mode: grantMode });

    const verb = grantMode === "set" ? "SET" : "+=";
    const parts = (Object.keys(axes) as AxisKey[]).map(
      (k) => `${AXIS_COLUMNS[k]} ${verb} ${axes[k]}`,
    );
    if (xp !== undefined) parts.push(`total_xp ${verb} ${xp}`);

    pushLog(`UPDATE profiles SET ${parts.join(", ")} WHERE username='${target.username}' — OK`);
    pushLog(`  ↳ total_xp=${updated.total_xp ?? 0} · level=${levelFromXp(updated.total_xp ?? 0)}`);

    if (isSelf) onProfileChange(updated);
    setSelectedUser(updated);
    setGrantAxes(EMPTY_GRANT);
    setGrantXp("");
    fetchProfiles();
  });
};

  const handleReset = () => {
    if (!target) return;
    const isSelf = target.id === profile.id;
    runAction(`reset:${target.id}`, async () => {
      const updated = await adminResetScores(target.id);
      pushLog(`UPDATE profiles SET all=0 WHERE username='${target.username}' — OK`);
      if (isSelf) onProfileChange(updated);
      setSelectedUser(updated);
      fetchProfiles();
    });
  };

  const handleDelete = () => {
    if (!target) return;
    const isSelf = target.id === profile.id;
    runAction(`delete:${target.id}`, async () => {
      await adminDeleteUser(target.id);
      pushLog(`DELETE FROM profiles WHERE username='${target.username}' — OK`);
      setSelectedUser(null);
      setConfirmDelete(false);
      if (isSelf) {
        onAccountDeleted();
      } else {
        fetchProfiles();
      }
    });
  };

  // ── Unauthorized view ──────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{  background: "#04060D" }}>
        <div className="max-w-md w-full rounded-2xl p-8 flex flex-col items-center gap-5 text-center" style={{ background: "rgba(20,6,10,0.9)", border: `1px solid ${red}55`, boxShadow: `0 0 80px ${red}22` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${red}12`, border: `2px solid ${red}55`, boxShadow: `0 0 30px ${red}33` }}>
            <ShieldAlert size={28} style={{ color: red }} />
          </div>
          <div className="space-y-2">
            <div className="text-xl font-bold tracking-[0.25em] font-mono" style={{ color: red }}>ACCESS DENIED</div>
            <div className="text-xs text-slate-500">Signed in as <span style={{ color: amber }}>{profile.username}</span> · required <span style={{ color: red }}>admin role</span></div>
          </div>
          <button onClick={onExit} className="w-full py-2.5 rounded-xl text-xs tracking-widest font-bold font-mono" style={{ background: `${red}12`, color: red, border: `1px solid ${red}33` }}>RETURN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100" style={{  background: "#04060D" }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-10%", left: "-6%", width: 620, height: 620, background: `radial-gradient(circle, ${green}14 0%, transparent 70%)` }} />
        <div className="absolute rounded-full" style={{ bottom: "-12%", right: "-8%", width: 560, height: 560, background: `radial-gradient(circle, ${blue}12 0%, transparent 70%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${green}06 1px, transparent 1px), linear-gradient(90deg, ${green}06 1px, transparent 1px)`, backgroundSize: "44px 44px" }} />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-8 py-4" style={{ borderBottom: `1px solid ${green}1A` }}>
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors">
            <ChevronLeft size={14} /> EXIT
          </button>
          <div className="h-4 w-px" style={{ background: `${green}22` }} />
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${green}14`, border: `1px solid ${green}33`, boxShadow: `0 0 20px ${green}22` }}>
            <Database size={16} style={{ color: green }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-[0.18em] font-mono">ADMIN PANEL · DB CONTROL</div>
            <div className="text-xs text-slate-500 tracking-wider">SUPER ADMIN — HỮU MẠNH</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded" style={{ background: `${green}12`, color: green, border: `1px solid ${green}30` }}>
          <ShieldCheck size={11} /> ROOT ACCESS
        </span>
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto p-6 space-y-5">

        {/* Telemetry row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Panel accent={green}>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-slate-500 font-mono">SUPABASE STATUS</span>
              <Server size={13} style={{ color: green }} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="relative flex h-2.5 w-2.5">
                {!error && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: green }} />}
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: error ? red : green }} />
              </span>
              <span className="text-lg font-bold" style={{ color: error ? red : green }}>{error ? "ERROR" : loading ? "SYNCING" : "CONNECTED"}</span>
            </div>
          </Panel>

          <Panel accent={blue}>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-slate-500 font-mono">DB LATENCY</span>
              <Activity size={13} style={{ color: blue }} />
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-2xl font-bold text-white">{latency}</span>
              <span className="text-sm text-slate-400">ms</span>
            </div>
            <div className="mt-2 h-5 flex items-end gap-0.5 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => {
                const h = ((Math.sin((i + beat) * 0.9) + 1) / 2) * 100;
                const spike = (i + beat) % 9 === 0 ? 100 : h;
                return <div key={i} className="flex-1 rounded-sm" style={{ height: `${20 + spike * 0.8}%`, background: `${blue}${spike > 80 ? "" : "55"}` }} />;
              })}
            </div>
          </Panel>

          <Panel accent={green}>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-slate-500 font-mono">TOTAL USERS</span>
              <Cpu size={13} style={{ color: green }} />
            </div>
            <div className="text-2xl font-bold text-white mt-3">{rows.length}</div>
            {partial.partial && (
              <div
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold"
                style={{
                  
                  background: "rgba(245,158,11,0.14)",
                  border: "1px solid rgba(245,158,11,0.45)",
                  color: "#FBBF24"}}
                title={`Nguon du phong: chi quet ${partial.scanned} nguoi choi dau tien.`}
              >
                DU LIEU MOT PHAN
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1">profiles · live</div>
          </Panel>

          <Panel accent={purple}>
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest text-slate-500 font-mono">TARGET</span>
              <UserCheck size={13} style={{ color: purple }} />
            </div>
            {selectedUser ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold" style={{ color: purple }}>{selectedUser.username}</div>
                  <div className="text-xs text-slate-500 mt-0.5">streak {selectedUser.synapse_streak}d · {selectedUser.algebraic_logic_score} pts</div>
                </div>
                <button onClick={() => { setSelectedUser(null); setConfirmDelete(false); }} className="shrink-0 text-slate-400 hover:text-slate-300 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400 mt-3">Click a row to select</div>
            )}
          </Panel>
        </div>

        {/* Admin Controls */}
        <Panel accent={amber} className="!p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: `1px solid ${amber}22` }}>
            <ShieldCheck size={14} style={{ color: amber }} />
            <span className="text-xs font-bold tracking-widest text-white font-mono">ADMIN CONTROLS</span>
            {selectedUser ? (
              <span className="text-xs px-2.5 py-0.5 rounded-lg ml-1" style={{ background: `${purple}18`, color: purple, border: `1px solid ${purple}30` }}>
                @{selectedUser.username}
                {selectedUser.id === profile.id && <span className="ml-1 text-xs opacity-70">(you)</span>}
              </span>
            ) : (
              <span className="text-xs text-slate-400 ml-1">— select a user from the table below</span>
            )}
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Add Points */}
            <div className="rounded-xl p-4" style={{ background: `${green}0A`, border: `1px solid ${green}22`, opacity: selectedUser ? 1 : 0.4 }}>
              <div className="flex items-center gap-2 mb-1">
                <Plus size={13} style={{ color: green }} />
                <span className="text-xs font-bold tracking-wider" style={{ color: green }}>ADD POINTS</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
  Nhập số vào từng trục. Bỏ trống nghĩa là không đụng tới. Số âm để trừ.
  Mọi trục đều bị kẹp trong 0–1000.
</p>

{/* Chế độ */}
<div className="grid grid-cols-2 gap-1 mb-3">
  {(["add", "set"] as const).map((m) => (
    <button
      key={m}
      onClick={() => setGrantMode(m)}
      disabled={!!busy || !selectedUser}
      className="py-1.5 rounded-lg text-xs font-bold tracking-wider"
      style={
        grantMode === m
          ? { background: `${green}22`, color: green, border: `1px solid ${green}55` }
          : { background: "rgba(0,0,0,0.3)", color: "#64748B", border: "1px solid rgba(255,255,255,0.06)" }
      }
    >
      {m === "add" ? "CỘNG THÊM" : "GÁN ĐÈ"}
    </button>
  ))}
</div>

{/* Điền nhanh cả 5 trục */}
<div className="grid grid-cols-5 gap-1 mb-3">
  {[10, 50, 100, 500, 1000].map((amt) => (
    <button
      key={amt}
      onClick={() => fillAllAxes(amt)}
      disabled={!!busy || !selectedUser}
      className="py-1 rounded-md text-xs font-bold"
      style={{ background: "rgba(0,0,0,0.3)", color: green, border: `1px solid ${green}22` }}
    >
      {amt}
    </button>
  ))}
</div>

{/* Ô nhập từng trục */}
<div className="space-y-1.5 mb-3">
  {([
    ["logic",   "LOGIC",   selectedUser?.algebraic_logic_score],
    ["memory",  "MEMORY",  selectedUser?.memory_score],
    ["speed",   "SPEED",   selectedUser?.speed_score],
    ["focus",   "FOCUS",   selectedUser?.focus_score],
    ["spatial", "SPATIAL", selectedUser?.cfop_spatial_record],
  ] as [AxisKey, string, number | null | undefined][]).map(([key, label, current]) => (
    <div key={key} className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-14 shrink-0">{label}</span>
      <span className="text-xs text-slate-400 w-10 shrink-0 text-right">{current ?? 0}</span>
      <input
        type="number"
        value={grantAxes[key]}
        onChange={(e) => setGrantAxes((g) => ({ ...g, [key]: e.target.value }))}
        disabled={!!busy || !selectedUser}
        placeholder="—"
        className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs text-white outline-none"
        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)"}}
      />
    </div>
  ))}

  <div className="flex items-center gap-2 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
    <span className="text-xs w-14 shrink-0" style={{ color: amber }}>XP</span>
    <span className="text-xs text-slate-400 w-10 shrink-0 text-right">
      {selectedUser?.total_xp ?? 0}
    </span>
    <input
      type="number"
      value={grantXp}
      onChange={(e) => setGrantXp(e.target.value)}
      disabled={!!busy || !selectedUser}
      placeholder="—"
      className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs text-white outline-none"
      style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${amber}33`}}
    />
  </div>

  {selectedUser && (
    <div className="text-xs text-slate-500 pl-16">
      Level hiện tại {levelFromXp(selectedUser.total_xp ?? 0)}
      {parseField(grantXp) !== undefined && (
        <span style={{ color: amber }}>
          {" → "}
          {levelFromXp(
            Math.max(
              0,
              grantMode === "set"
                ? (parseField(grantXp) ?? 0)
                : (selectedUser.total_xp ?? 0) + (parseField(grantXp) ?? 0),
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
  onClick={handleApplyGrant}
  full
/>
            </div>

            {/* Reset Scores */}
            <div className="rounded-xl p-4" style={{ background: `${blue}0A`, border: `1px solid ${blue}22`, opacity: selectedUser ? 1 : 0.4 }}>
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={13} style={{ color: blue }} />
                <span className="text-xs font-bold tracking-wider" style={{ color: blue }}>RESET SCORES</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Xóa toàn bộ điểm số và streak về 0.
              </p>
              {selectedUser && (
                <div className="grid grid-cols-4 gap-1 mb-3 text-center">
                  {[
                    { k: "LOGIC", v: selectedUser.algebraic_logic_score },
                    { k: "MEM",   v: selectedUser.memory_score },
                    { k: "SPD",   v: selectedUser.speed_score },
                    { k: "FOC",   v: selectedUser.focus_score },
                  ].map(({ k, v }) => (
                    <div key={k} className="rounded-lg py-1.5" style={{ background: "rgba(0,0,0,0.35)" }}>
                      <div className="text-[8px] text-slate-500">{k}</div>
                      <div className="text-xs font-bold text-white">{(v ?? 0).toLocaleString()}</div>
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
                onClick={handleReset}
                full
              />
            </div>

            {/* Danger: Delete */}
            <div className="rounded-xl p-4" style={{ background: `${red}0A`, border: `1px solid ${red}33`, opacity: selectedUser ? 1 : 0.4 }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={13} style={{ color: red }} />
                <span className="text-xs font-bold tracking-wider" style={{ color: red }}>DANGER ZONE</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Xóa vĩnh viễn profile. Không thể hoàn tác.
                {selectedUser?.id === profile.id && <span style={{ color: amber }}> Đây là tài khoản của bạn!</span>}
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
                    Xóa <span style={{ color: red }}>@{selectedUser?.username}</span>? Không hoàn tác được!
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionBtn accent="#64748B" label="HỦY" disabled={!!busy} onClick={() => setConfirmDelete(false)} />
                    <ActionBtn
                      accent={red}
                      label="XÓA"
                      icon={<Trash2 size={11} />}
                      loading={busy === `delete:${selectedUser?.id}`}
                      disabled={!!busy}
                      onClick={handleDelete}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Data table + Env */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel accent={green} className="lg:col-span-2 !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${green}18` }}>
              <div className="flex items-center gap-2">
                <Database size={14} style={{ color: green }} />
                <span className="text-xs font-bold tracking-widest text-white font-mono">LIVE DATA GRID</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${green}12`, color: green }}>public.profiles</span>
              </div>
              <button onClick={fetchProfiles} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> REFRESH
              </button>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
                  <Loader2 size={16} className="animate-spin" style={{ color: green }} /> Querying…
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 py-16 text-xs text-center px-6">
                  <AlertTriangle size={20} style={{ color: red }} />
                  <span style={{ color: red }}>Query failed</span>
                  <span className="text-slate-500 max-w-md break-words">{error}</span>
                  <button onClick={fetchProfiles} className="mt-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: `${green}12`, color: green, border: `1px solid ${green}30` }}>RETRY</button>
                </div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">No rows.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ background: "rgba(0,255,156,0.04)" }}>
                      {["Username", "Logic", "Memory", "Speed", "Focus", "Streak", "Sessions"].map((c) => (
                        <th key={c} className="px-4 py-2.5 text-xs tracking-wider whitespace-nowrap" style={{ color: green, borderBottom: `1px solid ${green}18` }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isAdminRow = r.role === "admin";
                      const isSelected = selectedUser?.id === r.id;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => { setSelectedUser(r); setConfirmDelete(false); }}
                          className="cursor-pointer transition-colors duration-100"
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            background: isSelected ? `${purple}18` : "transparent"}}
                          onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSelected ? `${purple}18` : "transparent"; }}
                        >
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: purple, boxShadow: `0 0 6px ${purple}` }} />}
                              <span style={{ color: isAdminRow ? amber : isSelected ? purple : "#E2E8F4" }}>
                                {r.username}
                                {isAdminRow && <span className="ml-1.5 text-xs" style={{ color: green }}>★</span>}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-white">{(r.algebraic_logic_score ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{(r.memory_score ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{(r.speed_score ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{(r.focus_score ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: blue }}>{r.synapse_streak}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{(r.schulte_sessions ?? 0) + (r.sudoku_sessions ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>

          <Panel accent={blue} className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={14} style={{ color: blue }} />
              <span className="text-xs font-bold tracking-widest text-white font-mono">API INTEGRATION</span>
            </div>
            <EnvField label="VITE_SUPABASE_URL" value={SUPABASE_URL} revealed={revealUrl} onToggle={() => setRevealUrl((v) => !v)} onCopy={() => copy("url", SUPABASE_URL)} copied={copied === "url"} mask={mask} accent={blue} />
            <EnvField label="VITE_SUPABASE_ANON_KEY" value={ANON_KEY} revealed={revealKey} onToggle={() => setRevealKey((v) => !v)} onCopy={() => copy("key", ANON_KEY)} copied={copied === "key"} mask={mask} accent={blue} />
            <div className="mt-4 p-3 rounded-lg text-xs text-slate-500 leading-relaxed" style={{ background: `${blue}06`, border: `1px solid ${blue}18` }}>
              <span style={{ color: blue }}>ⓘ</span> Anon key is safe for client use. Service role key is never exposed to the browser.
            </div>
          </Panel>
        </div>

        {/* Activity Log */}
        <Panel accent={green} className="!p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: `1px solid ${green}18` }}>
            <Terminal size={14} style={{ color: green }} />
            <span className="text-xs font-bold tracking-widest text-white font-mono">ACTIVITY LOG</span>
          </div>
          <div ref={logRef} className="px-5 py-3 h-36 overflow-y-auto text-xs leading-relaxed" style={{ background: "rgba(0,0,0,0.35)" }}>
            {log.map((line, i) => (
              <div key={i} style={{ color: line.includes("ERR") ? red : green }}>{line}</div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Panel({ children, className = "", accent = "#00FF9C" }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`rounded-xl p-5 ${className}`} style={{ background: "rgba(8,14,24,0.72)", border: `1px solid ${accent}22`, backdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.7778))", WebkitBackdropFilter: "blur(calc(var(--glass-blur, 18px) * 0.7778))", boxShadow: "0 4px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
      {children}
    </div>
  );
}

function ActionBtn({ label, accent, icon, onClick, loading = false, disabled = false, full = false }: {
  label: string; accent: string; icon?: React.ReactNode; onClick: () => void;
  loading?: boolean; disabled?: boolean; full?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-150 disabled:opacity-40 ${full ? "w-full" : ""}`}
      style={{ background: hover && !disabled ? `${accent}22` : `${accent}10`, color: accent, border: `1px solid ${accent}33`, boxShadow: hover && !disabled ? `0 0 18px ${accent}30` : "none" }}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function EnvField({ label, value, revealed, onToggle, onCopy, copied, mask, accent }: {
  label: string; value: string; revealed: boolean; onToggle: () => void;
  onCopy: () => void; copied: boolean; mask: (s: string) => string; accent: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs text-slate-500 mb-1.5 tracking-wider">{label}</div>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${accent}18` }}>
        <span className="flex-1 text-xs truncate" style={{ color: revealed ? accent : "#64748B" }}>{revealed ? value : mask(value)}</span>
        <button onClick={onToggle} className="text-slate-500 hover:text-white transition-colors shrink-0">{revealed ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button onClick={onCopy} className="text-slate-500 hover:text-white transition-colors shrink-0">{copied ? <Check size={13} style={{ color: accent }} /> : <Copy size={13} />}</button>
      </div>
    </div>
  );
}
