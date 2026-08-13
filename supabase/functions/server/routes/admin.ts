import type { Hono } from "npm:hono@4.12.27";
import {
  adminClient,
  EMPTY_SESSION_PATCH,
  PROFILE_COLS,
  XP_MAX,
} from "../config.ts";
import { authenticatedUser, requireAdmin } from "../security.ts";
import { logServerEvent, requestIdFor } from "../_shared/observability.ts";
import { AXIS_COLUMNS } from "../_shared/axes.ts";

export function registerAdminRoutes(app: Hono): void {
  app.post("/server/admin-grant", async (c) => {
    try {
      const user = await authenticatedUser(c);
      await requireAdmin(user.id);
      const { targetId, axes = {}, xp, mode = "add" } = await c.req.json();
      if (!targetId || !["add", "set"].includes(mode))
        return c.json({ error: "Invalid admin grant" }, 400);
      const { data: target, error: readError } = await adminClient
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", targetId)
        .single();
      if (readError || !target)
        throw readError ?? new Error("Target not found");
      // supabase-js tra ve union co GenericStringError -> ep ve record de doc cot dong.
      const targetRow = target as unknown as Record<string, unknown>;
      const patch: Record<string, number> = {};
      for (const [key, column] of Object.entries(AXIS_COLUMNS)) {
        if (axes[key] === undefined || !Number.isFinite(Number(axes[key])))
          continue;
        const amount = Number(axes[key]),
          current = Number(targetRow[column] ?? 0),
          next = mode === "set" ? amount : current + amount;
        patch[column] = Math.max(0, Math.min(1000, Math.round(next)));
      }
      if (xp !== undefined && Number.isFinite(Number(xp))) {
        const next =
          mode === "set"
            ? Number(xp)
            : Number(targetRow.total_xp ?? 0) + Number(xp);
        // Chan tren bat buoc: mot lan go nham so 0 tung day total_xp len 1e14,
        // keo level nhay len 1.414.214 va lam hong ca bang xep hang. XP_MAX ung
        // voi level ~2000, du cho moi muc choi that ma van khong tran float8.
        patch.total_xp = Math.max(0, Math.min(XP_MAX, Math.round(next)));
      }
      if (!Object.keys(patch).length)
        return c.json({ error: "Nothing to update" }, 400);
      const { data, error } = await adminClient
        .from("profiles")
        .update(patch)
        .eq("id", targetId)
        .select(PROFILE_COLS)
        .single();
      if (error) throw error;
      // Cong XP bang quyen admin thi phai danh gia lai badge NGAY. Truoc day
      // badge chi duoc dong bo khi nguoi dung TU MO bang thanh tuu, nen tai
      // khoan duoc admin keo len level 7 van trong tron badge cho den luc do.
      // Loi dong bo KHONG duoc lam that bai ca lenh grant: XP da ghi xong roi,
      // va badge se tu dong bo lai o lan mo bang thanh tuu ke tiep.
      if (patch.total_xp !== undefined) {
        const { error: syncError } = await adminClient.rpc(
          "sync_achievements_for",
          { p_user: targetId },
        );
        if (syncError)
          logServerEvent({
            event: "server.log",
            level: "error",
            message: `Admin grant badge sync failed: ${syncError.message}`,
          });
      }

      logServerEvent({
        event: "admin.grant",
        level: "warn",
        persist: true,
        userId: user.id,
        requestId: requestIdFor(c.req.raw),
        context: { targetId, mode, axes, xp, actor: user.id },
      });

      return c.json({ profile: data });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        403,
      );
    }
  });

  app.post("/server/admin-reset", async (c) => {
    try {
      const user = await authenticatedUser(c);
      await requireAdmin(user.id);
      const { targetId } = await c.req.json();
      if (!targetId) return c.json({ error: "targetId required" }, 400);
      const patch = {
        algebraic_logic_score: 0,
        memory_score: 0,
        speed_score: 0,
        focus_score: 0,
        cfop_spatial_record: 0,
        ...EMPTY_SESSION_PATCH,
        total_xp: 0,
        last_active_date: null,
      };
      const { data, error } = await adminClient
        .from("profiles")
        .update(patch)
        .eq("id", targetId)
        .select(PROFILE_COLS)
        .single();
      if (error) throw error;

      logServerEvent({
        event: "admin.reset",
        level: "warn",
        persist: true,
        userId: user.id,
        requestId: requestIdFor(c.req.raw),
        context: { targetId, actor: user.id },
      });

      return c.json({ profile: data });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        403,
      );
    }
  });

  // Admin xoa user tron (profile + auth + avatar).
  app.post("/server/admin-delete-user", async (c) => {
    try {
      const user = await authenticatedUser(c);
      await requireAdmin(user.id);
      const { targetId } = await c.req.json();
      if (!targetId) return c.json({ error: "targetId required" }, 400);
      if (targetId === user.id)
        return c.json(
          { error: "Use delete-account for your own account" },
          400,
        );

      try {
        const { data: listed } = await adminClient.storage
          .from("avatars")
          .list(targetId);
        if (listed && listed.length > 0) {
          await adminClient.storage
            .from("avatars")
            .remove(listed.map((f) => `${targetId}/${f.name}`));
        }
      } catch (storageErr) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `admin-delete-user storage: ${storageErr}`,
        });
      }

      // Xoa auth truoc; FK ON DELETE CASCADE don profile va cac bang con.
      const { error: authErr } =
        await adminClient.auth.admin.deleteUser(targetId);
      if (authErr) throw authErr;
      // Fallback cho DB cu chua co cascade. Service role nen idempotent.

      const { error: profileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetId);
      if (profileErr)
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `admin-delete-user profile fallback: ${profileErr.message}`,
        });
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status =
        msg.includes("authorization") ||
        msg.includes("session") ||
        msg.includes("Admin")
          ? 403
          : 400;
      return c.json({ error: msg }, status);
    }
  });
}
