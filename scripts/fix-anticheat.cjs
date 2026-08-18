const fs = require('fs');

const path = 'supabase/functions/_shared/anticheat.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace types
code = code.replace(/export type CheatSeverity = "soft" \| "hard";/g, 'export type SignalClass = "statistical" | "physical";');
code = code.replace(/severity: CheatSeverity;/g, 'signal_class: SignalClass;');
code = code.replace(/severity: CheatSeverity,/g, 'signal_class: SignalClass,');
code = code.replace(/\): CheatFlag => \(\{ msg, severity, detail \}\);/g, '): CheatFlag => ({ msg, signal_class, detail });');

// Re-map usages
// All uses of flag(..., "soft" | "hard", ...)
// Usually CV < 0.04, speed metrics -> statistical
// "Reaction median impossibly low" -> statistical
// "Client time far exceeds server elapsed" -> physical (or statistical? Let's say physical if it's impossible physics, but usually network delay. It's structural, but we can call it physical)
code = code.replace(/severity: "soft"/g, 'signal_class: "statistical"');
code = code.replace(/severity: "hard"/g, 'signal_class: "physical"');

code = code.replace(/severity/g, 'signal_class');

// Replace hasHardFlag and softFlags logic
const hardFlagLogic = `
export function shouldReject(report: CheatReport): boolean {
  const physicals = report.flags.filter(f => f.signal_class === "physical").length;
  const statisticals = report.flags.filter(f => f.signal_class === "statistical").length;
  return physicals >= 1 || statisticals >= 2;
}

export function softFlags(report: CheatReport): CheatFlag[] {
  // Return flags that are statistical if we didn't reject, or maybe all of them
  return report.flags.filter((f) => f.signal_class === "statistical");
}
`;
code = code.replace(/export function hasHardFlag[\s\S]*?}/, '');
code = code.replace(/export function softFlags[\s\S]*?}/, hardFlagLogic);

fs.writeFileSync(path, code);
console.log('Fixed anticheat.ts');
