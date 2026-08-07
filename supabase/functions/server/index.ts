import { Hono } from "npm:hono@4.12.27";
import { configureMiddleware } from "./middleware.ts";
import { registerAccountRoutes } from "./routes/account.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerRoundRoutes } from "./routes/rounds.ts";
import { registerTelemetryRoutes } from "./routes/telemetry.ts";

const app = new Hono();

configureMiddleware(app);

app.get("/server/health", (c) => c.json({ status: "ok" }));
registerTelemetryRoutes(app);
registerAuthRoutes(app);
registerRoundRoutes(app);
registerAdminRoutes(app);
registerAccountRoutes(app);

Deno.serve(app.fetch);
