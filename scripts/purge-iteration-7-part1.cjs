const fs = require('fs');
const path = require('path');
const docsPath = path.join(process.cwd(), 'docs');

function replaceInFile(fileName, searches, replacements) {
  const p = path.join(docsPath, fileName);
  if (!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8');
  for (let i = 0; i < searches.length; i++) {
    c = c.replace(searches[i], replacements[i]);
  }
  fs.writeFileSync(p, c);
  console.log(`Updated ${fileName}`);
}

// 1. feature_games_scoring.txt & feature_anticheat_observability.txt (Phase 1 & 2)
replaceInFile('feature_games_scoring.txt', [
  /UNIQUE INDEX \(user_id, active_slot\)/g,
  /active_slot 1–3/g,
  /WHERE id = roundId\n\s*AND state = 'issued'/g,
  /Memory = accuracy \*\* 1\.2\s*Focus = accuracy \*\* 1\.15/g,
  /ELO \/ Rating/g
], [
  "UNIQUE INDEX round_ticket_active_slot_uidx ON public.round_tickets (user_id, active_slot) WHERE state IN ('issued', 'processing')",
  "active_slot BETWEEN 1 AND 3 (trong state 'issued' hoặc 'processing')",
  "WHERE id = p_round_id AND user_id = auth.uid() AND state = 'issued' AND expires_at > clock_timestamp()",
  "const hitRate = (hits + 0.5) / (targets + 1); const falseAlarmRate = (falseAlarms + 0.5) / (nonTargets + 1); const dPrime = inverseNormalCdf(hitRate) - inverseNormalCdf(falseAlarmRate); const sensitivity = calibrateDPrime(dPrime, calibration.nback); const memory = clamp(MAX * Math.pow(sensitivity, 1.2) * (0.62 + 0.36 * depth));",
  "Robust Rolling Rating"
]);

replaceInFile('feature_anticheat_observability.txt', [
  /WHERE state = 'processing' AND processing_started_at < now\(\) - interval '2 minutes' AND attempt_count < 3/g,
  /UPDATE public.round_tickets SET state = 'issued', processing_token = NULL, attempt_count = attempt_count \+ 1/g
], [
  "WHERE state = 'processing' AND processing_started_at < now() - interval '2 minutes'",
  "UPDATE public.round_tickets SET attempt_count = attempt_count + 1, state = CASE WHEN attempt_count + 1 >= 3 THEN 'failed' ELSE 'issued' END, processing_token = NULL, processing_started_at = NULL, active_slot = CASE WHEN attempt_count + 1 >= 3 THEN NULL ELSE active_slot END"
]);

// 2. version-policy.md (Phase 1)
replaceInFile('version-policy.md', [
  /SCORERS_BY_VERSION\s*TELEMETRY_SCHEMA_VERSIONS/g,
  /currentVersion - 2/g
], [
  "type VersionRegistry<T> = Readonly<Partial<Record<number, T>>>;\nconst registry = <T>(values: VersionRegistry<T>): VersionRegistry<T> => values;\nexport const SCORERS_BY_VERSION = { schulte: registry<Scorer>({ 1: scoreSchulteV1, 2: scoreSchulteV2 }) } satisfies Record<GameId, VersionRegistry<Scorer>>;\n// Cần thêm SCHEMAS_BY_VERSION, SCHEMA_ADAPTERS_BY_VERSION, INSPECTORS_BY_VERSION, SHARED_INSPECTORS_BY_VERSION, CONFIGS_BY_VERSION.",
  "SUPPORTED_TELEMETRY_VERSIONS = { schulte: new Set([2, 3]) }"
]);

// 3. feature_admin.txt & feature_auth_profile.txt (Phase 1)
replaceInFile('feature_admin.txt', [
  /feature_admin\.txt §4\.C\.4/g,
  /Xóa Storage trực tiếp/g
], [
  "POST /server/account-deletions (State machine: requested -> sessions_revoked -> storage_deleted -> database_cleaned -> auth_deleted -> completed)",
  "Journal Deletion"
]);
replaceInFile('feature_auth_profile.txt', [
  /UPDATE profiles qua RLS/g,
  /UPDATE profiles\.avatar_url/g,
  /Xóa tài khoản trực tiếp API/g,
  /SHA-256 IP/g
], [
  "update_my_birth_date() via RPC",
  "update_my_avatar() via RPC",
  "Journal Deletion",
  "HMAC-SHA256(rotating_secret, canonical_ip)"
]);

// 4. privacy-and-terms.md & data-retention.md (Phase 3)
replaceInFile('data-retention.md', [
  /Raw telemetry: “90–180 ngày”/g,
  /Journal: 7–30 ngày/g
], [
  "Raw gameplay telemetry: 180 ngày",
  "Completed outbox/journal: 7 ngày"
]);

// 5. feature_offline_pwa.txt (Phase 3)
replaceInFile('feature_offline_pwa.txt', [
  /status: "ok" \| "duplicate" \| "rejected" \| "error"/g
], [
  'status: "ok" | "duplicate" | "rejected" | "error" | "unsupported_schema" (terminal: true)'
]);

console.log("Iteration 7 purge script complete.");
