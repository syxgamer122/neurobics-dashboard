const fs = require('fs');

const featureFiles = [
  'feature_admin.txt',
  'feature_anticheat_observability.txt',
  'feature_auth_profile.txt',
  'feature_games_scoring.txt',
  'feature_gamification_social.txt',
  'feature_offline_pwa.txt',
  'feature_ui_dashboard.txt'
];

let newDoc = '';

for (const file of featureFiles) {
  newDoc += '================================================================================\n';
  newDoc += 'docs/' + file + '\n';
  newDoc += '================================================================================\n\n';
  newDoc += fs.readFileSync('docs/' + file, 'utf8') + '\n\n';
}

newDoc += '---\n## LATEST UPDATES (PHASE 24-27)\n' + 
'- **Phase 26 (Security Definer Hardening):**\n' +
'  - Thêm `search_visible` (mặc định `true`) vào `profiles` cho phép ẩn danh tài khoản.\n' +
'  - RPC `search_players` và `send_friend_request` được đóng gói lại với `SET search_path = \'\'` và kiểm tra gắt gao `auth.uid()`.\n' +
'  - Rate limiting được tích hợp ngay trong `search_players` qua RPC `check_rate_limit` ở cấp độ CSDL (15 req / 5 phút).\n' +
'- **Phase 27 (Session Versioning):**\n' +
'  - Mô hình chấm điểm nay được phiên bản hoá qua `profiles.rating_model_version` (với các session truyền `p_scorer_version`).\n' +
'  - View `profiles_decayed` và hàm `get_population_stats` nay lọc trực tiếp theo `rating_model_version`, tránh trộn điểm cũ mới.\n' +
'- **Export Data (CCPA/GDPR):** Mở rộng endpoint `/server/account/export` để trích xuất cả thành tựu, nhiệm vụ, sổ cái điểm kinh nghiệm (xp_events), và danh sách bạn bè.\n' +
'- **Brand Fixes:** Trả domain gốc về `mindgem.local`, email pháp lý về `privacy@mindgem.org`.\n';

fs.writeFileSync('docs_for_review.txt', newDoc);
