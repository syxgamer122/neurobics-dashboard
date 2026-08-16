const fs = require('fs');

let doc = fs.readFileSync('docs_for_review.txt', 'utf8');
const searchStr = '## LATEST UPDATES (PHASE 24-27)';
const index = doc.indexOf(searchStr);
if (index !== -1) {
  doc = doc.substring(0, index);
  doc += \## LATEST UPDATES (PHASE 24-27)
- **Phase 26 (Security Definer Hardening):** 
  - Thêm \\\search_visible\\\ (mặc định \\\	rue\\\) vào \\\profiles\\\ cho phép ẩn danh tài khoản.
  - RPC \\\search_players\\\ và \\\send_friend_request\\\ được đóng gói lại với \\\SET search_path = ''\\\ và kiểm tra gắt gao \\\uth.uid()\\\.
  - Rate limiting được tích hợp ngay trong \\\search_players\\\ qua RPC \\\check_rate_limit\\\ ở cấp độ CSDL (15 req / 5 phút).
- **Phase 27 (Session Versioning):** 
  - Mô hình chấm điểm nay được phiên bản hoá qua \\\profiles.rating_model_version\\\ (với các session truyền \\\p_scorer_version\\\).
  - View \\\profiles_decayed\\\ và hàm \\\get_population_stats\\\ nay lọc trực tiếp theo \\\ating_model_version\\\, tránh trộn điểm cũ mới.
- **Export Data (CCPA/GDPR):** Mở rộng endpoint \\\/server/account/export\\\ để trích xuất cả thành tựu, nhiệm vụ, sổ cái điểm kinh nghiệm (xp_events), và danh sách bạn bè.
- **Brand Fixes:** Trả domain gốc về \\\mindgem.local\\\, email pháp lý về \\\privacy@mindgem.org\\\.\n\;
  fs.writeFileSync('docs_for_review.txt', doc);
}

let aiReview = fs.readFileSync('ai_review.md', 'utf8');
const aiSearchStr = '### CẬP NHẬT GẦN NHẤT (PHASE 24-27)';
const aiIndex = aiReview.indexOf(aiSearchStr);
if (aiIndex !== -1) {
  aiReview = aiReview.substring(0, aiIndex);
  aiReview += \### CẬP NHẬT GẦN NHẤT (PHASE 24-27)
- **Phase 26 (Security Definer Hardening):** Đã sửa \\\search_players\\\ và \\\send_friend_request\\\ với \\\SET search_path = ''\\\, thêm rate limiting (15/5m) và \\\search_visible\\\ toggle.
- **Phase 27 (Session Versioning):** \\\profiles\\\ nay lưu \\\ating_model_version\\\ từ \\\submit_round_transaction\\\. \\\get_population_stats\\\ tách tập người chơi theo version.
- **Export Data (CCPA/GDPR):** \\\/server/account/export\\\ nay trả về thêm \\\user_achievements\\\, \\\user_quests\\\, \\\xp_events\\\, \\\riendships\\\.
- **Brand Fixes:** Xử lý toàn bộ lỗi find-replace. Domain hiện đang là \\\mindgem.local\\\. Các file MD được trả lại brand \\\MindGem\\\.\n\;
  fs.writeFileSync('ai_review.md', aiReview);
}
