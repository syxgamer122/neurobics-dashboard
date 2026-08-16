import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logServerEvent } from "../_shared/observability.ts";

const WEBHOOK_URL = Deno.env.get("ALERT_WEBHOOK_URL") || "";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Very basic auth to ensure only pg_net can call this
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EDGE_SERVICE_ROLE_KEY") || "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    
    // Log to standard logging pipeline
    logServerEvent({
      event: "alert.triggered",
      level: "error",
      message: payload.message || "Alert triggered",
      ...payload,
    });

    // Send to external webhook (Discord/Slack) if configured
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🚨 **ALERT:** ${payload.message}\n\`\`\`json\n${JSON.stringify(payload.metrics, null, 2)}\n\`\`\``
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
