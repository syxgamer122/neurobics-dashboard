/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { AXIS_COLUMNS, type AxisKey } from "../lib/api";
import { levelFromXp } from "../lib/xp";
import {
  adminApplyGrant,
  adminDeleteUser,
  adminResetScores,
  adminListProfiles,
  type AdminGrant,
} from "../lib/api/admin";
import { type Profile } from "../lib/api/internal";
import { useAppState } from "../hooks/use-app-state";
import {
  AccessDenied,
  ActivityLog,
  AdminControls,
  AdminOverview,
  AdminShell,
  ApiIntegrationPanel,
  parseGrantField,
  ProfilesGrid,
  type GrantMode,
} from "./admin";

const EMPTY_GRANT: AdminGrant["axes"] = {};

export function AdminPanel({
  onExit,
  onProfileChange,
  onAccountDeleted,
}: {
  onExit: () => void;
  onProfileChange: (p: Profile) => void;
  onAccountDeleted: () => void;
}) {
  const { profile } = useAppState();
  const isAdmin = profile?.role === "admin";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [latency, setLatency] = useState(0);
  const [busy, setBusy] = useState<string | false>(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [grantAxes, setGrantAxes] = useState<AdminGrant["axes"]>(EMPTY_GRANT);
  const [grantXp, setGrantXp] = useState<string>("");

  const [log, setLog] = useState<string[]>([]);
  const [grantMode, setGrantMode] = useState<GrantMode>("add");

  const pushLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const data = await (adminListProfiles as any)();
      setLatency(Math.max(1, Math.round(performance.now() - startedAt)));
      setRows(data);
      pushLog(
        `GET /admin-list-profiles - 200 OK (${data.length} rows, ${Math.round(performance.now() - startedAt)}ms)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushLog(`ERR :: GET /admin-list-profiles - ${message}`);
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
      setBusy(false);
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

    const isSelf = target.id === profile?.id;
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
    const isSelf = target.id === profile?.id;
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
    const isSelf = target.id === profile?.id;
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
          Partial={Partial}
          selectedUser={selectedUser}
          onClearSelected={() => {
            setSelectedUser(null);
            setConfirmDelete(false);
          }}
        />

        <AdminControls
          selectedUser={selectedUser}
          currentUserId={profile?.id}
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
