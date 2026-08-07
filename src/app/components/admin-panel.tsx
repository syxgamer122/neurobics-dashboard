import { useCallback, useEffect, useState } from "react";
import {
  adminApplyGrant,
  adminDeleteUser,
  adminResetScores,
  AXIS_COLUMNS,
  dataQuality,
  fetchLeaderboard,
  type AxisKey,
  type DataQuality,
  type Profile,
} from "../lib/api";
import { levelFromXp } from "../lib/xp";
import {
  AccessDenied,
  ActivityLog,
  AdminControls,
  AdminOverview,
  AdminShell,
  ApiIntegrationPanel,
  consoleBoot,
  EMPTY_GRANT,
  parseGrantField,
  ProfilesGrid,
  type GrantAxes,
  type GrantMode,
} from "./admin";

export function AdminPanel({
  onExit,
  profile,
  onProfileChange,
  onAccountDeleted,
}: {
  onExit: () => void;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onAccountDeleted: () => void;
}) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState(12);
  const [partial, setPartial] = useState<DataQuality>({
    partial: false,
    scanned: 0,
  });
  const [log, setLog] = useState<string[]>(consoleBoot);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [grantAxes, setGrantAxes] = useState<GrantAxes>(EMPTY_GRANT);
  const [grantXp, setGrantXp] = useState("");
  const [grantMode, setGrantMode] = useState<GrantMode>("add");

  const isAdmin = profile.role === "admin";

  const pushLog = useCallback(
    (line: string) =>
      setLog((current) => [
        ...current.slice(-60),
        `[${new Date().toLocaleTimeString("en-GB")}] ${line}`,
      ]),
    [],
  );

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const data = await fetchLeaderboard();
      setLatency(Math.max(1, Math.round(performance.now() - startedAt)));
      setRows(data);
      setPartial({ ...dataQuality.leaderboard });
      if (dataQuality.leaderboard.partial) {
        pushLog(
          `WARN :: fallback quet toi da ${dataQuality.leaderboard.scanned} dong — thu hang co the thieu nguoi`,
        );
      }
      pushLog(
        `SELECT * FROM profiles — 200 OK (${data.length} rows, ${Math.round(performance.now() - startedAt)}ms)`,
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      pushLog(`ERR :: SELECT FROM profiles — ${message}`);
    } finally {
      setLoading(false);
    }
  }, [pushLog]);

  useEffect(() => {
    if (isAdmin) fetchProfiles();
    else setLoading(false);
  }, [fetchProfiles, isAdmin]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (!isAdmin || busy) return;
    setBusy(key);
    try {
      await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      pushLog(`ERR :: ${key} — ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleApplyGrant = () => {
    if (!selectedUser) return;

    const target = selectedUser;
    const axes: Partial<Record<AxisKey, number>> = {};
    for (const key of Object.keys(grantAxes) as AxisKey[]) {
      const value = parseGrantField(grantAxes[key]);
      if (value !== undefined) axes[key] = value;
    }

    const xp = parseGrantField(grantXp);
    if (Object.keys(axes).length === 0 && xp === undefined) {
      pushLog("SKIP :: không có trường nào được nhập");
      return;
    }

    const isSelf = target.id === profile.id;
    void runAction(`grant:${target.id}`, async () => {
      const updated = await adminApplyGrant(target.id, {
        axes,
        xp,
        mode: grantMode,
      });

      const verb = grantMode === "set" ? "SET" : "+=";
      const parts = (Object.keys(axes) as AxisKey[]).map(
        (key) => `${AXIS_COLUMNS[key]} ${verb} ${axes[key]}`,
      );
      if (xp !== undefined) parts.push(`total_xp ${verb} ${xp}`);

      pushLog(
        `UPDATE profiles SET ${parts.join(", ")} WHERE username='${target.username}' — OK`,
      );
      pushLog(
        `  ↳ total_xp=${updated.total_xp ?? 0} · level=${levelFromXp(updated.total_xp ?? 0)}`,
      );

      if (isSelf) onProfileChange(updated);
      setSelectedUser(updated);
      setGrantAxes(EMPTY_GRANT);
      setGrantXp("");
      void fetchProfiles();
    });
  };

  const handleReset = () => {
    if (!selectedUser) return;

    const target = selectedUser;
    const isSelf = target.id === profile.id;
    void runAction(`reset:${target.id}`, async () => {
      const updated = await adminResetScores(target.id);
      pushLog(
        `UPDATE profiles SET all=0 WHERE username='${target.username}' — OK`,
      );
      if (isSelf) onProfileChange(updated);
      setSelectedUser(updated);
      void fetchProfiles();
    });
  };

  const handleDelete = () => {
    if (!selectedUser) return;

    const target = selectedUser;
    const isSelf = target.id === profile.id;
    void runAction(`delete:${target.id}`, async () => {
      await adminDeleteUser(target.id);
      pushLog(`DELETE FROM profiles WHERE username='${target.username}' — OK`);
      setSelectedUser(null);
      setConfirmDelete(false);
      if (isSelf) {
        onAccountDeleted();
      } else {
        void fetchProfiles();
      }
    });
  };

  if (!isAdmin) {
    return <AccessDenied username={profile.username} onExit={onExit} />;
  }

  return (
    <AdminShell onExit={onExit}>
      <div className="relative z-10 max-w-[1440px] mx-auto p-6 space-y-5">
        <AdminOverview
          loading={loading}
          error={error}
          latency={latency}
          usersCount={rows.length}
          partial={partial}
          selectedUser={selectedUser}
          onClearSelected={() => {
            setSelectedUser(null);
            setConfirmDelete(false);
          }}
        />

        <AdminControls
          selectedUser={selectedUser}
          currentUserId={profile.id}
          busy={busy}
          confirmDelete={confirmDelete}
          grantAxes={grantAxes}
          grantXp={grantXp}
          grantMode={grantMode}
          setGrantAxes={setGrantAxes}
          setGrantXp={setGrantXp}
          setGrantMode={setGrantMode}
          setConfirmDelete={setConfirmDelete}
          onApplyGrant={handleApplyGrant}
          onReset={handleReset}
          onDelete={handleDelete}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ProfilesGrid
            rows={rows}
            loading={loading}
            error={error}
            selectedUser={selectedUser}
            onRefresh={() => void fetchProfiles()}
            onSelect={(target) => {
              setSelectedUser(target);
              setConfirmDelete(false);
            }}
          />
          <ApiIntegrationPanel />
        </div>

        <ActivityLog lines={log} />
      </div>
    </AdminShell>
  );
}
