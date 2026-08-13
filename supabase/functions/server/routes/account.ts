import type { Hono } from "npm:hono@4.12.27";
import { adminClient } from "../config.ts";
import { authenticatedUser } from "../security.ts";
import { logServerEvent } from "../_shared/observability.ts";

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
}
