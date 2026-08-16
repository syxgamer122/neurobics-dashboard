const fs = require('fs');

// feature_games_scoring.txt
let scoring = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');
scoring = scoring.replace(
  'Logic: clamp(MAX * diff * accuracy * (0.72 + 0.28 * pace))',
  'Logic: clamp(MAX * diff * accuracy)\n      Speed: speed(clean, target, diff) * (0.55 + 0.45 * accuracy)'
);
scoring = scoring.replace('Cập nhật tổng XP và Level người dùng.', 'Trigger trg_xp_events_apply tự cộng xp_awarded vào profiles.total_xp.\n    - Level được derive từ total_xp (levelFromXp), không lưu cột riêng.');
scoring = scoring.replace('module client (UI-only) `provisional-score.ts` cho phép', 'module client (UI-only) `provisional-score.ts` cho phép');
if (!scoring.includes('Chỉ dùng cho preview và animation')) {
  scoring = scoring.replace('3.2 ĐÁNH GIÁ CHỈ SỐ', '3.2 ĐÁNH GIÁ CHỈ SỐ\n\nModule UI-only. Chỉ dùng cho preview và animation; kết quả không authoritative. EMA thật do submit_round_transaction tính.');
}
scoring = scoring.replace(/computeProvisionalRoundResult/g, 'estimateRoundResult');
fs.writeFileSync('docs/feature_games_scoring.txt', scoring);

// feature_auth_profile.txt
let auth = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
auth = auth.replace('Email-Spoofing (@neurobics.local)', 'Email-Spoofing (@mindgem.local)');
auth = auth.replace('F. DATA EXPORT COMPLIANCE', '8.2. DATA EXPORT COMPLIANCE');
auth = auth.replace('Cần bổ sung ràng buộc tuổi tối thiểu', 'Giải pháp đã áp dụng: validate client <= currentYear - 13, DB trigger trg_check_min_age chặn cứng ở tầng cuối.');
fs.writeFileSync('docs/feature_auth_profile.txt', auth);

// feature_ui_dashboard.txt
let dash = fs.readFileSync('docs/feature_ui_dashboard.txt', 'utf8');
dash = dash.replace(/computeProvisionalRoundResult/g, 'estimateRoundResult');
let changelogIndex = dash.indexOf('--- LATEST UPDATES (PHASE 24-27) ---');
if (changelogIndex > -1) {
  dash = dash.substring(0, changelogIndex).trim();
}
fs.writeFileSync('docs/feature_ui_dashboard.txt', dash);

// offline-queue.ts
let offPath = 'src/app/lib/offline-queue.ts';
if (fs.existsSync(offPath)) {
  let off = fs.readFileSync(offPath, 'utf8');
  off = off.replace('Mặc định là 1', 'Mặc định là TELEMETRY_SCHEMA_VERSION');
  fs.writeFileSync(offPath, off);
}

// feature_admin.txt
let admin = fs.readFileSync('docs/feature_admin.txt', 'utf8');
admin = admin.replace('Đưa toàn bộ điểm chỉ số 5 trục, XP và số liệu phiên chơi của người dùng được chọn về 0.', 'Đưa 5 trục và session counters về 0, đẩy stats_epoch = now() để XP hiệu dụng tính lại từ đầu. Ledger xp_events được giữ nguyên làm audit trail.');
fs.writeFileSync('docs/feature_admin.txt', admin);

// feature_anticheat_observability.txt
let anti = fs.readFileSync('docs/feature_anticheat_observability.txt', 'utf8');
anti = anti.replace(/Đội ngũ\s*N\s*<\s*3\s*N<3/g, 'sample size N < 3');
anti = anti.replace(/Đội ngũ N < 3 N<3/g, 'sample size N < 3');
fs.writeFileSync('docs/feature_anticheat_observability.txt', anti);

// feature_offline_pwa.txt
let pwa = fs.readFileSync('docs/feature_offline_pwa.txt', 'utf8');
pwa = pwa.replace('Check Profile -> Guest Mode? ->', 'Check Profile ->');
pwa = pwa.replace(/computeProvisionalRoundResult/g, 'estimateRoundResult');
fs.writeFileSync('docs/feature_offline_pwa.txt', pwa);
