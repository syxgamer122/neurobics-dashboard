import type { Hono } from "npm:hono@4.12.27";
import { adminClient } from "../config.ts";
import { authenticatedUser, consumeRateLimit, clientIp } from "../security.ts";
import { logServerEvent } from "../../_shared/observability.ts";

export function registerAccountRoutes(app: Hono): void {
  // ─── Delete own account (auth user + profile + avatars) ─────────────────────
  // Requires service role: auth.admin.deleteUser cannot run from the browser.
  app.post("/server/delete-account", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const userId = user.id;

      // 1) Remove avatar objects under avatars/<userId>/
      try {
        const { data: listed } = await adminClient.storage
          .from("avatars")
          .list(userId);
        if (listed && listed.length > 0) {
          await adminClient.storage
            .from("avatars")
            .remove(listed.map((f) => `${userId}/${f.name}`));
        }
      } catch (storageErr) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `Delete-account storage cleanup: ${storageErr}`,
        });
      }

      // 2) Xoa auth user TRUOC. FK ON DELETE CASCADE se don profile va bang con.
      // Neu DB cu chua co cascade, lenh fallback service-role ben duoi se don profile.
      const { error: authErr } =
        await adminClient.auth.admin.deleteUser(userId);
      if (authErr) throw authErr;

      // 3) Fallback idempotent: khong de profile mo coi neu FK cu chua cascade.
      const { error: profileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (profileErr)
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `Delete-account profile fallback failed: ${profileErr.message}`,
        });

      return c.json({ ok: true });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Delete account error: ${err}`,
      });
      const msg = err instanceof Error ? err.message : String(err);
      const status =
        msg.includes("authorization") || msg.includes("session") ? 401 : 400;
      return c.json({ error: msg }, status);
    }
  });

  // ─── Export account data (GDPR/CCPA compliance) ─────────────────────────
  app.get("/server/account/export", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const userId = user.id;

      const allowed = await consumeRateLimit(`export_data:${userId}`, 1, 86400);
      if (!allowed) {
        logServerEvent({
          event: "server.log",
          level: "warn",
          message: `Rate limit exceeded for data export: ${userId}`,
        });
        return c.json(
          {
            error:
              "Too many requests. You can only export data once per 24 hours.",
          },
          429,
        );
      }

      logServerEvent({
        event: "server.log",
        level: "info",
        message: `Data export initiated by user: ${userId}`,
      });

      await adminClient.from("admin_audit").insert({
        action: "export_data",
        target_user_id: userId,
        details: { ip: clientIp(c) },
      });

      // Gather profile
      const { data: profile } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      // Gather tickets
      const { data: tickets } = await adminClient
        .from("round_tickets")
        .select("*")
        .eq("user_id", userId);

      // Gather sessions
      const { data: sessions } = await adminClient
        .from("training_sessions")
        .select("*")
        .eq("user_id", userId);

      const { data: achievements } = await adminClient
        .from("user_achievements")
        .select("*")
        .eq("user_id", userId);
      const { data: quests } = await adminClient
        .from("user_quests")
        .select("*")
        .eq("user_id", userId);
      const { data: xp_events } = await adminClient
        .from("xp_events")
        .select("*")
        .eq("user_id", userId);
      const { data: friendships } = await adminClient
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      return c.json({
        export_date: new Date().toISOString(),
        user_id: userId,
        email: user.email,
        profile,
        tickets: tickets ?? [],
        sessions: sessions ?? [],
        achievements: achievements ?? [],
        quests: quests ?? [],
        xp_events: xp_events ?? [],
        friendships: friendships ?? [],
      });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Export account error: ${err}`,
      });
      const msg = err instanceof Error ? err.message : String(err);
      const status =
        msg.includes("authorization") || msg.includes("session") ? 401 : 400;
      return c.json({ error: msg }, status);
    }
  });
}
