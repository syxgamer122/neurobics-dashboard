import { Hono } from "npm:hono@4.12.27";
import { configureMiddleware } from "./middleware.ts";
import { adminClient } from "./config.ts";
import { setEventSink } from "../_shared/observability.ts";
import { registerAccountRoutes } from "./routes/account.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerRoundRoutes } from "./routes/rounds.ts";
import { registerTelemetryRoutes } from "./routes/telemetry.ts";

const app = new Hono();

configureMiddleware(app);

// Global sink cho server-side events, chong mat mat khi Edge Function thoat som
setEventSink((rows) => {
  const promise = adminClient
    .from("observability_events")
    .insert(rows)
    .then(({ error }) => {
      if (error) console.error(`observability insert failed: ${error.message}`);
    });
  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(promise);
  }
});

app.get("/server/health", (c) => c.json({ status: "ok" }));
registerTelemetryRoutes(app);
registerAuthRoutes(app);
registerRoundRoutes(app);
registerAdminRoutes(app);
registerAccountRoutes(app);

Deno.serve(app.fetch);
