import type { Hono } from "npm:hono@4.12.27";
import { getFeatureFlags } from "../../_shared/feature-flags.ts";

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
}
