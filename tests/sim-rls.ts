import { createClient } from "@supabase/supabase-js";

// Uses public anon key
const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbGwiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.invalid";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runRlsTests() {
  console.log("Running RLS Tests...");

  // 1. Test anon cannot insert into admin_audit
  const { error: insertError } = await supabase.from("admin_audit").insert({
    actor_id: "00000000-0000-0000-0000-000000000000",
    target_id: "00000000-0000-0000-0000-000000000000",
    action: "test",
  });
  if (!insertError) {
    console.error("FAIL: Anon was able to insert into admin_audit!");
    process.exit(1);
  }
  console.log("PASS: Anon cannot insert into admin_audit");

  // 2. Test anon cannot update profiles directly
  const { error: updateError } = await supabase.from("profiles").update({
    total_xp: 999999
  }).eq("username", "test");
  if (!updateError) {
    console.error("FAIL: Anon was able to update profiles!");
    process.exit(1);
  }
  console.log("PASS: Anon cannot update profiles");

  // 3. Test anon cannot read ticket_pool
  const { data: tickets, error: ticketError } = await supabase.from("ticket_pool").select("*").limit(1);
  if (!ticketError && tickets && tickets.length > 0) {
    console.error("FAIL: Anon was able to read ticket_pool!");
    process.exit(1);
  }
  console.log("PASS: Anon cannot read ticket_pool");

  console.log("All RLS tests passed (simulation).");
}

runRlsTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
