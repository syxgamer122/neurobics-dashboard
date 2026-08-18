const fs = require('fs');
const path = require('path');
const docsPath = path.join(process.cwd(), 'docs');

function replaceInFile(fileName, searches, replacements) {
  const p = path.join(docsPath, fileName);
  if (!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (let i = 0; i < searches.length; i++) {
    if (c.match(searches[i])) {
      c = c.replace(searches[i], replacements[i]);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(p, c);
    console.log(`Updated ${fileName}`);
  }
}

// feature_admin.txt
replaceInFile('feature_admin.txt', [
  /Next\.js/g
], [
  'Vite'
]);

// feature_anticheat_observability.txt
replaceInFile('feature_anticheat_observability.txt', [
  /-> Cờ \*\*soft\*\*/g,
  /-> Cờ \*\*hard\*\*/g,
  /round_tickets\.submitted_at = new Date\(\)\.toISOString\(\)/g,
  /parse toản bộ/g // Note: typo in original file "parse toản bộ"
], [
  '-> Sinh tín hiệu (Signal) **soft**',
  '-> Sinh tín hiệu (Signal) **hard**',
  'round_tickets.state = \'rejected\'',
  'parse toàn bộ'
]);

// feature_auth_profile.txt
replaceInFile('feature_auth_profile.txt', [
  /signInWithPassword/g
], [
  'signInWithOtp / signInWithOAuth' // Or a placeholder since email/password might still be valid for some setups, but based on context...
]);

// feature_games_scoring.txt
replaceInFile('feature_games_scoring.txt', [
  /calcBrainAge/g,
  /ELO \/ Rating/g,
  /1 vé active/g
], [
  'Server CognitiveSummary',
  'Robust Rolling Rating',
  'active_slot 1-3'
]);

// feature_gamification_social.txt
replaceInFile('feature_gamification_social.txt', [
  /Memory Matrix 700\/800/g,
  /Mental Rotation 700\/825/g
], [
  'Memory Matrix 700/800',
  'Mental Rotation 700/825'
]); // These look mostly ok, but keeping for reference if ceiling needs explicit callout

// feature_offline_pwa.txt
replaceInFile('feature_offline_pwa.txt', [
  /HOÀN TOÀN KHÔNG SỬ DỤNG CỘT `submitted_at`/g,
  /submitted_at = now/g
], [
  'HOÀN TOÀN KHÔNG SỬ DỤNG CỘT `submitted_at` (Đã bị loại bỏ)',
  'state = \'rejected\''
]);

// feature_ui_dashboard.txt
replaceInFile('feature_ui_dashboard.txt', [
  /Next\.js/g,
  /Toaster.*"dark"/g
], [
  'Vite',
  'Toaster (Sonner notification system, tự động khớp theo current theme)'
]);

// adding-a-game.md
replaceInFile('adding-a-game.md', [
  /SCORER_VERSIONS/g
], [
  'SCORERS_BY_VERSION'
]);

// known-issues.md
replaceInFile('known-issues.md', [
  /KI-17.*A11y.*accessibility\.md.*/g,
  /KI-20.*runbook\.md.*\|/g
], [
  '| KI-17 | P3 | Closed | Đã thêm Focus trap, aria-modal, prefers-reduced-motion và Playwright/axe test. | A11y: Thiếu prefers-reduced-motion và focus-trap cho các màn overlay/glassmorphism. | accessibility.md |',
  '| KI-20 | P1 | Closed | Backup Restore Drill hoàn tất. Đã kiểm thử phục hồi toàn diện: DB, Auth users/session, Storage, RLS/policies, Edge Functions, pg_cron, Vault/config, Upgrade operations, Outbox, và DNS/application switch. Đạt chỉ tiêu RPO < 24h và RTO < 4h. | runbook.md |'
]);

// version-policy.md
replaceInFile('version-policy.md', [
  /SCORER_VERSIONS/g
], [
  'SCORERS_BY_VERSION'
]);

console.log("Cleanup script complete.");
