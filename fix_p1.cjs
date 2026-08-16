const fs = require('fs');

// 1. rating_model_version replaces/supplements scorer_version
let gamesScoring = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');
gamesScoring = gamesScoring.replace('Gửi request `POST /server/submit-round` với `game`, `telemetry`, và `fingerprint`.', 'Gửi request `POST /server/submit-round` với `game`, `telemetry`, và `fingerprint`. (Truyền thêm `p_scorer_version` bằng `SCORER_VERSIONS[game]`).');
gamesScoring = gamesScoring.replace('từ `game-registry.ts`)', 'từ `game-registry.ts`) và ghi nhận `rating_model_version` vào bảng `profiles`');
gamesScoring = gamesScoring.replace('Lấy dữ liệu từ view `profiles_decayed`.', 'Lấy dữ liệu từ view `profiles_decayed`. Hàm `get_population_stats` nay bắt buộc phải lọc theo `p_model_version` để so sánh ngang hàng.');
fs.writeFileSync('docs/feature_games_scoring.txt', gamesScoring);

// 2. search_visible and check_rate_limit in gamification
let gamification = fs.readFileSync('docs/feature_gamification_social.txt', 'utf8');
gamification = gamification.replace('RPC `search_players(p_query, p_limit)` được gọi, trả về danh sách profile.', 'RPC `search_players(p_query, p_limit)` được gọi, trả về danh sách profile. Được bảo vệ bởi DB-level `check_rate_limit` (15 request/5 phút) và chỉ trả về các tài khoản bật `search_visible`.');
fs.writeFileSync('docs/feature_gamification_social.txt', gamification);

// 3. UI button text: "CÀI ĐẶT NEUROBICS" -> "CÀI ĐẶT MINDGEM"
let dashboard = fs.readFileSync('docs/feature_ui_dashboard.txt', 'utf8');
dashboard = dashboard.replace('CÀI ĐẶT NEUROBICS', 'CÀI ĐẶT MINDGEM');
fs.writeFileSync('docs/feature_ui_dashboard.txt', dashboard);

// 4. Update i18n
for (const file of ['src/app/i18n/vi.ts', 'src/app/i18n/en.ts']) {
  if (fs.existsSync(file)) {
    let i18n = fs.readFileSync(file, 'utf8');
    i18n = i18n.replace('CÀI ĐẶT NEUROBICS', 'CÀI ĐẶT MINDGEM').replace('INSTALL NEUROBICS', 'INSTALL MINDGEM');
    fs.writeFileSync(file, i18n);
  }
}

// 5. operations-dashboard.md FP Rate
let opsDash = fs.readFileSync('docs/operations-dashboard.md', 'utf8');
opsDash = opsDash.replace('Mục tiêu: False Positive Rate < 0.5%', 'Mục tiêu: Theo dõi (Complaints)');
opsDash = opsDash.replace('SELECT\n  count', '-- Alias: fp_rate_complaints\nSELECT\n  count');
opsDash += `

### 3.1. False Positive Rate (Mẫu ngẫu nhiên - Mục tiêu < 0.5%)
\`\`\`sql
-- Cron hàng tuần: nạp mẫu
INSERT INTO cheat_flag_review_queue (flag_id, sampled_at)
SELECT id, now() FROM cheat_flags
WHERE severity = 'hard'
  AND created_at > now() - interval '7 days'
  AND review_status IS NULL
ORDER BY random() LIMIT 50;
\`\`\`
`;
fs.writeFileSync('docs/operations-dashboard.md', opsDash);

// 6. ADR-0006 admin_audit exception
let adr6 = fs.readFileSync('docs/adr/0006-append-only-admin-audit.md', 'utf8');
adr6 += `
## Ngoại lệ
Ngoại lệ duy nhất: hàm prune_admin_audit() chạy SECURITY DEFINER dưới owner bảng, không nhận tham số, chỉ được DELETE WHERE created_at < now() - interval '365 days'. pg_cron gọi hàm này, không gọi DELETE trực tiếp. Mỗi lần chạy ghi lại một dòng vào chính admin_audit (số dòng đã xóa, khoảng thời gian).
`;
fs.writeFileSync('docs/adr/ADR-0006-append-only-audit-log.md', adr6);
