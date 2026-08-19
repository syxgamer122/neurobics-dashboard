import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { logServerEvent } from "../_shared/observability.ts";

// Initialize Supabase Admin Client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("EDGE_SERVICE_ROLE_KEY") ||
  "";

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

serve(async (req: Request) => {
  // Allow only POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Optional: check Authorization header if invoked directly
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateLimit = thirtyDaysAgo.toISOString();

    // Find all guest profiles created > 30 days ago that have no training sessions
    // Using a left join or NOT IN is tricky with PostgREST, so we'll fetch guests
    // and then check sessions. For performance, we can query profiles with a specific condition.

    // 1. Fetch abandoned guests via RPC (includes 30 days and 0 sessions check)
    const { data: guests, error: fetchErr } = await adminClient.rpc(
      "get_abandoned_guests",
    );

    if (fetchErr) throw fetchErr;

    if (!guests || guests.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          deleted: 0,
          msg: "No abandoned guests found.",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let deletedCount = 0;

    // 2. Delete the abandoned guests
    for (const guest of guests) {
      // Abandoned guest -> delete from auth.users via Admin API
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(
        guest.id,
      );

      if (!deleteErr) {
        deletedCount++;
      }
    }

    logServerEvent({
      event: "server.log",
      level: "info",
      message: `cleanup-guests cron completed: Deleted ${deletedCount} abandoned guest accounts.`,
    });

    return new Response(JSON.stringify({ ok: true, deleted: deletedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logServerEvent({
      event: "server.log",
      level: "error",
      message: `cleanup-guests error: ${msg}`,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
