const fs = require('fs');

// 1. Update feature_gamification_social.txt
let socialPath = 'docs/feature_gamification_social.txt';
if (fs.existsSync(socialPath)) {
  let social = fs.readFileSync(socialPath, 'utf8');
  if (!social.includes('search_visible')) {
    social = social.replace('C. TÌM KIẾM BẠN BÈ (SEARCH)', 'C. TÌM KIẾM BẠN BÈ (SEARCH)\n\nLưu ý Privacy: Người dùng có cờ `search_visible = false` sẽ bị ẩn khỏi kết quả tìm kiếm (chỉ ảnh hưởng `search_players`, không ảnh hưởng `get_friend_leaderboard`). Mặc định cờ này là `true` (opt-out).\nRate limit tìm kiếm: 15 request / 5 phút / user.');
    fs.writeFileSync(socialPath, social);
  }
}

// 2. Update feature_games_scoring.txt
let scoringPath = 'docs/feature_games_scoring.txt';
if (fs.existsSync(scoringPath)) {
  let scoring = fs.readFileSync(scoringPath, 'utf8');
  if (!scoring.includes('rating_model_version')) {
    scoring = scoring.replace('4.4 COGNITIVE INDEX VÀ CẬP NHẬT QUẦN THỂ', '4.4 COGNITIVE INDEX VÀ CẬP NHẬT QUẦN THỂ\n\n- `profiles_decayed` view và hàm `get_population_stats` hiện đã hỗ trợ phân tách `rating_model_version` để chấm điểm chính xác theo phiên bản model.\n');
    fs.writeFileSync(scoringPath, scoring);
  }
  
  // also fix formatting in §5 BƯỚC 3
  scoring = scoring.replace(/- Level được derive từ total_xp/, '    + Level được derive từ total_xp (levelFromXp)');
  fs.writeFileSync(scoringPath, scoring);
}

// 3. Update feature_auth_profile.txt
let authPath = 'docs/feature_auth_profile.txt';
if (fs.existsSync(authPath)) {
  let auth = fs.readFileSync(authPath, 'utf8');
  if (!auth.includes('/server/account/export')) {
    auth = auth.replace('8.2. DATA EXPORT COMPLIANCE', '8.2. DATA EXPORT COMPLIANCE\n\nEndpoint `/server/account/export` trả về toàn bộ dữ liệu người dùng (profiles, round_tickets, training_sessions, achievements, quests, xp_events, friendships). Rate limit: 1 request/24h/user. Audit log `admin_audit` `export_data` được ghi nhận.');
    fs.writeFileSync(authPath, auth);
  }
}

// 4. Update tools/scan.mjs
let scanPath = 'tools/scan.mjs';
if (fs.existsSync(scanPath)) {
  let scan = fs.readFileSync(scanPath, 'utf8');
  if (!scan.includes('FLOOR/MIN_RT')) {
    let newRule = `  { name: "duplicate-80ms", re: /const\\s+(?:[a-zA-Z0-9_]*FLOOR[a-zA-Z0-9_]*|[a-zA-Z0-9_]*MIN_RT[a-zA-Z0-9_]*)\\s*=\\s*80\\b/g, msg: "Cấm khai báo lại 80ms, phải import từ _shared/limits.ts" },`;
    scan = scan.replace('const RULES = [', 'const RULES = [\n' + newRule);
    fs.writeFileSync(scanPath, scan);
  }
}

// 5. Update tools/scan-docs.mjs
let scanDocsPath = 'tests/scan-docs.mjs';
if (fs.existsSync(scanDocsPath)) {
  let scanDocs = fs.readFileSync(scanDocsPath, 'utf8');
  if (!scanDocs.includes('duplicated-label')) {
    let newRule = `  { name: "duplicated-label", re: /(Giải pháp[^:]*:)\\s*\\1/ },\n  { name: "orphan-clause",    re: /\\.\\s+\\([^)]+\\)\\s+(để|nhằm|cho)\\s/ },`;
    scanDocs = scanDocs.replace('const RULES = [', 'const RULES = [\n' + newRule);
    fs.writeFileSync(scanDocsPath, scanDocs);
  }
}
