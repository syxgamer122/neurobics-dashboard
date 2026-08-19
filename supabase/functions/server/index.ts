import { Hono } from "npm:hono@4.12.27";
import { configureMiddleware } from "./middleware.ts";
import { adminClient } from "./config.ts";
import { setEventSink, setMetricSink } from "../_shared/observability.ts";
import { registerAccountRoutes } from "./routes/account.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerRoundRoutes } from "./routes/rounds.ts";
import { registerTelemetryRoutes } from "./routes/telemetry.ts";
import { registerFlagsRoutes } from "./routes/flags.ts";

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

setMetricSink((path, status, latency) => {
  const promise = adminClient
    .rpc("record_http_metric", {
      p_path: path,
      p_status_code: status,
      p_latency: latency,
    })
    .then(({ error }) => {
      if (error) console.error(`record_http_metric failed: ${error.message}`);
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
registerFlagsRoutes(app);

Deno.serve(app.fetch);
