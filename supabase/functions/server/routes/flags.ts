import type { Hono } from "npm:hono@4.12.27";
import {
  getFeatureFlags,
  invalidateFlagsCache,
  type FeatureFlag,
} from "../../_shared/feature-flags.ts";
import { adminClient } from "../config.ts";
import { requireAdmin } from "../security.ts";
import { logServerEvent, requestIdFor } from "../../_shared/observability.ts";

export function registerFlagsRoutes(app: Hono): void {
  app.get("/server/flags", async (c) => {
    try {
      const flags = await getFeatureFlags();
      return c.json({ flags });
    } catch (err) {
      console.error("Error fetching flags", err);
      return c.json({ error: "failed_to_fetch_flags" }, 500);
    }
  });

  app.post("/server/admin-flags", async (c) => {
    try {
      const user = await requireAdmin(c, "flags");
      const body = await c.req.json();
      const { key, enabled } = body;
      const rollout =
        body.rollout_percentage !== undefined
          ? body.rollout_percentage
          : body.rolloutPercentage !== undefined
            ? body.rolloutPercentage
            : null;

      if (!key || typeof key !== "string" || key.trim().length === 0) {
        return c.json({ error: "Missing or invalid flag key" }, 400);
      }

      if (typeof enabled !== "boolean") {
        return c.json({ error: "Flag enabled must be boolean" }, 400);
      }

      if (
        rollout !== null &&
        rollout !== undefined &&
        (typeof rollout !== "number" ||
          !Number.isFinite(rollout) ||
          rollout < 0 ||
          rollout > 100)
      ) {
        return c.json(
          { error: "Rollout percentage must be between 0 and 100 or null" },
          400,
        );
      }

      const normalizedRollout =
        rollout === null || rollout === undefined ? null : Math.round(rollout);
      const normalizedKey = key.trim();
      const now = new Date().toISOString();

      const { data: updated, error: dbErr } = await adminClient
        .from("feature_flags")
        .upsert(
          {
            key: normalizedKey,
            enabled,
            rollout_percentage: normalizedRollout,
            updated_at: now,
          },
          { onConflict: "key" },
        )
        .select("*")
        .single();

      if (dbErr) {
        logServerEvent({
          event: "server.log",
          level: "error",
          message: `admin-flags DB error: ${dbErr.message}`,
        });
        return c.json({ error: "Failed to update feature flag" }, 500);
      }

      invalidateFlagsCache();

      const reqId = requestIdFor(c.req.raw) || "";
      await adminClient.from("admin_audit").insert({
        actor_id: user.id,
        target_id: null,
        action: "flag.update",
        context: {
          key: normalizedKey,
          enabled,
          rollout_percentage: normalizedRollout,
        },
        request_id: reqId,
      });

      return c.json({
        success: true,
        flag: (updated ?? {
          key: normalizedKey,
          enabled,
          rollout_percentage: normalizedRollout,
          updated_at: now,
        }) as FeatureFlag,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAuth =
        msg.includes("MFA") ||
        msg.includes("Admin") ||
        msg.includes("authorization") ||
        msg.includes("session");
      return c.json({ error: msg }, isAuth ? 403 : 400);
    }
  });
}
