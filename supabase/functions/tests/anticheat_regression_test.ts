import { assertEquals } from "jsr:@std/assert@0.224.0";
import { inspectRound, hasHardFlag, softFlags } from "../_shared/anticheat.ts";
import type { Game } from "../_shared/scoring/core.ts";
import cases from "./fixtures/anticheat-cases.json" with { type: "json" };

Deno.test("Anti-cheat regression suite", async (t) => {
  for (const c of cases) {
    await t.step(`${c.game} - ${c.id}`, () => {
      const cheat = inspectRound(c.game as Game, c.telemetry, c.elapsed);
      const isHard = hasHardFlag(cheat);
      const isSoft = softFlags(cheat).length > 0;
      
      let actualOutcome = "accept";
      if (isHard) {
        actualOutcome = "hard_reject";
      } else if (isSoft) {
        actualOutcome = "soft_flag";
      }
      
      assertEquals(actualOutcome, c.expected_outcome, `Failed case ${c.id}`);
    });
  }
});
