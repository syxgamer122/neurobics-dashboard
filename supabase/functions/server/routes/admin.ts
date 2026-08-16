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
  app.get("/server/admin-list-profiles", async (c) => {
    try {
      const user = await requireAdmin(c, "list_profiles");
      
      const { data, error } = await adminClient
        .from("profiles_decayed")
        .select(PROFILE_COLS)
        .order("created_at", { ascending: false })
        .limit(100);
        
      if (error) throw error;
      return c.json({ profiles: data });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  app.post("/server/admin-grant", async (c) => {
    try {
      const user = await requireAdmin(c, "grant");
      const { targetId, axes = {}, xp, mode = "add", reason = "Admin manual grant" } = await c.req.json();
      if (!targetId || !["add", "set"].includes(mode))
        return c.json({ error: "Invalid admin grant" }, 400);
      
      const reqId = requestIdFor(c.req.raw) || "";

      // Call the atomic RPC to lock, update profiles, record xp_events, and write admin_audit
      const { data, error } = await adminClient.rpc("admin_grant", {
        p_target_id: targetId,
        p_xp_amount: xp !== undefined && Number.isFinite(Number(xp)) ? Math.round(Number(xp)) : null,
        p_xp_mode: mode,
        p_axes: Object.keys(axes).length > 0 ? axes : null,
        p_axes_mode: mode,
        p_reason: reason,
        p_admin_id: user.id,
        p_request_id: reqId
      });

      if (error) throw error;

      const { data: updated, error: refreshError } = await adminClient
        .from("profiles_decayed")
        .select(PROFILE_COLS)
        .eq("id", targetId)
        .single();
      if (refreshError || !updated)
        throw refreshError ?? new Error("Target disappeared");
      return c.json({ profile: updated, patch: data.patch });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        403,
      );
    }
  });

  app.post("/server/admin-reset", async (c) => {
    try {
      const user = await requireAdmin(c, "reset");
      const { targetId, reason = "Admin manual reset" } = await c.req.json();
      if (!targetId) return c.json({ error: "targetId required" }, 400);

      const reqId = requestIdFor(c.req.raw) || "";
      const { error } = await adminClient.rpc("admin_reset_stats", {
        p_target_id: targetId,
        p_reason: reason,
        p_admin_id: user.id,
        p_request_id: reqId
      });

      if (error) throw error;
      
      const { data: updated, error: refreshError } = await adminClient
        .from("profiles_decayed")
        .select(PROFILE_COLS)
        .eq("id", targetId)
        .single();
      
      if (refreshError || !updated) throw refreshError ?? new Error("Target disappeared");
      return c.json({ profile: updated });
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
      const user = await requireAdmin(c, "delete");
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

      // Fetch profile to get username for the audit log
      const { data: profile } = await adminClient
        .from("profiles")
        .select("username")
        .eq("id", targetId)
        .single();
        
      // Xoa auth truoc; FK ON DELETE CASCADE don profile va cac bang con.
      const { error: authErr } =
        await adminClient.auth.admin.deleteUser(targetId);
      if (authErr) throw authErr;

      // Ghi log SAU khi xoa thanh cong, vi constraint FK da duoc xoa
      await adminClient.from("admin_audit").insert({
        actor_id: user.id,
        target_id: targetId,
        action: "delete",
        context: { target_username: profile?.username || "unknown" },
        request_id: requestIdFor(c.req.raw),
      });

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
