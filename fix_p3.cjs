const fs = require('fs');

// 9. version-policy.md
let versionPolicy = fs.readFileSync('docs/version-policy.md', 'utf8');
versionPolicy = versionPolicy.replace('Ba constant version', 'Bốn constant version');
// add SHARED_INSPECTOR to the table in §2
if (!versionPolicy.includes('| SHARED_INSPECTOR |')) {
  versionPolicy = versionPolicy.replace(
    /\| SCORER\s*\|.*\|.*\|/i,
    '$&\n| SHARED_INSPECTOR | Không bump | Khi sửa logic inspectShared / inspectSubThreshold |'
  );
}
fs.writeFileSync('docs/version-policy.md', versionPolicy);

// 10. feature_admin.txt XP formula clamp
let featureAdmin = fs.readFileSync('docs/feature_admin.txt', 'utf8');
featureAdmin = featureAdmin.replace(/Server kẹp XP bằng công thức:\s+`XP delta = Math\.round\(calculatedDelta\)`/, 'Edge Function chỉ làm tròn delta bằng `Math.round(calculatedDelta)`. Ràng buộc biên nằm ở RPC admin_grant_tx — chặn abs(delta) > 10,000,000 và chặn tổng sau khi cộng vượt XP_MAX = 200,000,000.');
fs.writeFileSync('docs/feature_admin.txt', featureAdmin);

// P3: adding-a-game.md
let addingGame = fs.readFileSync('docs/adding-a-game.md', 'utf8');
addingGame = addingGame.replace(/Mindgem/g, 'MindGem');
fs.writeFileSync('docs/adding-a-game.md', addingGame);

// P3: Header of 5 feature files
const featureFiles = [
  'docs/feature_admin.txt',
  'docs/feature_anticheat_observability.txt',
  'docs/feature_auth_profile.txt',
  'docs/feature_games_scoring.txt',
  'docs/feature_gamification_social.txt',
  'docs/feature_offline_pwa.txt',
  'docs/feature_ui_dashboard.txt'
];
for (const file of featureFiles) {
  let doc = fs.readFileSync(file, 'utf8');
  doc = doc.replace(/DỰ ÁN:\s*MINDGEM\s*\/\s*NEUROBICS/gi, 'DỰ ÁN: MINDGEM');
  doc = doc.replace(/\-\s*MINDGEM\s*\/\s*NEUROBICS/gi, '- MINDGEM');
  fs.writeFileSync(file, doc);
}

// P3: architecture-contracts.md ADR-0007 -> ADR-0001
let arch = fs.readFileSync('docs/architecture-contracts.md', 'utf8');
arch = arch.replace('Fake Email Auth (ADR-0007)', 'Fake Email Auth (ADR-0001)');
fs.writeFileSync('docs/architecture-contracts.md', arch);

// P3: feature_auth_profile.txt two E sections, age validation
let authProfile = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
// Replace second E.
authProfile = authProfile.replace('E. DATA EXPORT COMPLIANCE', 'F. DATA EXPORT COMPLIANCE');
// Replace age validation text
authProfile = authProfile.replace('Sẽ cần bổ sung API yêu cầu người dùng xác nhận tuổi thật', 'Hệ thống đã xác thực tuổi hợp lệ qua 3 tầng (Database Check Constraint, API Validation, và Client Middleware chặn UX)');
fs.writeFileSync('docs/feature_auth_profile.txt', authProfile);

// P3: feature_admin.txt §C.3 extra newlines
let admin = fs.readFileSync('docs/feature_admin.txt', 'utf8');
admin = admin.replace(/SELECT\s+id,\s+username\s+FROM\s+profiles\s+WHERE\s+search_visible\s*=\s*true;\s*```\n\n\n/gi, 'SELECT id, username FROM profiles WHERE search_visible = true;\n```\n');
fs.writeFileSync('docs/feature_admin.txt', admin);

// P3: staging-environment.md step 2
let staging = fs.readFileSync('docs/staging-environment.md', 'utf8');
staging = staging.replace('2. Local Testing against Staging:', '2. Local Testing against Staging (chỉ dùng cho test local, trên CI đã được xử lý tự động):');
fs.writeFileSync('docs/staging-environment.md', staging);

// P3: feature_anticheat_observability.txt §5 empty line
let anticheat = fs.readFileSync('docs/feature_anticheat_observability.txt', 'utf8');
anticheat = anticheat.replace(/giải thích tại ADR-0006\)\.\n6\./g, 'giải thích tại ADR-0006).\n\n6.');
fs.writeFileSync('docs/feature_anticheat_observability.txt', anticheat);

