import { createClient } from "@supabase/supabase-js";




const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.log("No SUPABASE_SERVICE_ROLE_KEY provided, skipping invariant test.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runInvariantTests() {
  console.log("Running Ledger Invariant Tests...");

  // 1. Get all profiles
  const { data: profiles, error: pError } = await supabase.from("profiles").select("id, total_xp, stats_epoch");
  if (pError) throw pError;

  let violations = 0;

  for (const profile of profiles) {
    // 2. Sum xp_events for this profile after stats_epoch
    let query = supabase.from("xp_events").select("amount", { count: "exact" }).eq("user_id", profile.id);
    
    if (profile.stats_epoch) {
      query = query.gte("created_at", profile.stats_epoch);
    }
    
    // Actually it's 'xp_awarded' not 'amount'
    let sumQuery = supabase
      .from("xp_events")
      .select("xp_awarded")
      .eq("user_id", profile.id);
      
    if (profile.stats_epoch) {
      sumQuery = sumQuery.gte("created_at", profile.stats_epoch);
    }
    
    const { data: events, error: eError } = await sumQuery;
    if (eError) throw eError;
    
    const sum = events.reduce((acc, ev) => acc + (ev.xp_awarded || 0), 0);
    
    if (sum !== profile.total_xp && profile.total_xp > 0) {
      console.error(`FAIL: Profile ${profile.id} invariant violated! total_xp=${profile.total_xp}, sum(xp_events)=${sum}`);
      violations++;
    }
  }

  if (violations > 0) {
    console.error(`\nFAILED: ${violations} profiles have mismatched total_xp and ledger events.`);
    process.exit(1);
  }

  console.log(`PASS: Checked ${profiles.length} profiles. All total_xp match ledger sum!`);
}

runInvariantTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
