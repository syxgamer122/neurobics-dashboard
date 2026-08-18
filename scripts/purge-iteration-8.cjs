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

// architecture-contracts.md
replaceInFile('architecture-contracts.md', [
  /Gọi `supabase\.auth\.updateUser` để liên kết email mới/g,
  /Database Trigger cấp quyền sau xác minh email/g
], [
  'Gọi `finalize_guest_upgrade_tx` qua Server Orchestrator để liên kết email mới',
  'Server Orchestrator cấp quyền sau xác minh (ADR 0009)'
]);

// data-retention.md
replaceInFile('data-retention.md', [
  /90–180 ngày/g,
  /90-180 ngày/g,
  /7–30 ngày/g,
  /7-30 ngày/g
], [
  '180 ngày',
  '180 ngày',
  '7 ngày',
  '7 ngày'
]);

// feature_auth_profile.txt
replaceInFile('feature_auth_profile.txt', [
  /auth\.updateUser\(\)/g,
  /saveBirthYear\(\)/g,
  /uploadAvatar\(\) -> UPDATE profiles/g
], [
  'Server Orchestrator (ADR 0009)',
  'update_my_birth_date() via RPC',
  'update_my_avatar() via RPC'
]);

// feature_offline_pwa.txt
replaceInFile('feature_offline_pwa.txt', [
  /status: "ok" \| "duplicate" \| "rejected" \| "error" \| "unsupported_schema" \(terminal: true\)/g
], [
  'status: "ok" | "duplicate" | "rejected" | "error"; terminal?: boolean'
]);

// feature_ui_dashboard.txt
replaceInFile('feature_ui_dashboard.txt', [
  /saveBirthYear\(\)/g
], [
  'update_my_birth_date() via RPC'
]);

// privacy-and-terms.md
replaceInFile('privacy-and-terms.md', [
  /90–180 ngày/g,
  /90-180 ngày/g,
  /7–30 ngày/g,
  /7-30 ngày/g
], [
  '180 ngày',
  '180 ngày',
  '7 ngày',
  '7 ngày'
]);

console.log("Iteration 8 purge script complete.");
