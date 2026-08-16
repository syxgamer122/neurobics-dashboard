import { inspectRound, hasHardFlag, softFlags } from "../supabase/functions/_shared/anticheat.ts";
import type { Game } from "../supabase/functions/_shared/scoring/core.ts";
import fs from "fs";

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log("Running anticheat regression tests...");
  const casesRaw = fs.readFileSync("supabase/functions/tests/fixtures/anticheat-cases.json", "utf-8");
  const cases = JSON.parse(casesRaw);

  let passed = 0;
  for (const c of cases) {
    console.log(`Testing case: ${c.game} - ${c.id}`);
    const cheat = inspectRound(c.game as Game, c.telemetry, c.elapsed);
    const isHard = hasHardFlag(cheat);
    const isSoft = softFlags(cheat).length > 0;
    
    let actualOutcome = "accept";
    if (isHard) {
      actualOutcome = "hard_reject";
    } else if (isSoft) {
      actualOutcome = "soft_flag";
    }
    
    try {
      assertEqual(actualOutcome, c.expected_outcome, `Case ${c.id} failed`);
      console.log(`  ✓ Passed`);
      passed++;
    } catch (e) {
      console.error(`  ✗ Failed: ${(e as Error).message}`);
    }
  }

  console.log(`\nResults: ${passed}/${cases.length} passed.`);
  if (passed !== cases.length) {
    process.exit(1);
  }
}

runTests().catch(console.error);
