const fs = require('fs');

let social = fs.readFileSync('docs/feature_gamification_social.txt', 'utf8');
social = social.replace(
  '- C. TÌM KIẾM NGƯỜI CHƠI (SEARCH PLAYERS)\n  - Client gửi debounce search query (tối thiểu 3 ký tự, delay 350ms).\n  - RPC `search_players(p_query, p_limit)` trả về danh sách user khớp username (chặn kết quả trả về quá nhiều để chống quét dữ liệu, giới hạn p_limit = 10).\n',
  '- C. TÌM KIẾM NGƯỜI CHƠI (SEARCH PLAYERS)\n  - Cờ ẩn danh `search_visible`: Trong bảng profiles, cờ này (mặc định `true` = opt-out) quyết định user có xuất hiện trong kết quả tìm kiếm không. `search_visible = false` chỉ ẩn khỏi `search_players`, bạn bè đã kết nối vẫn thấy nhau trong `get_friend_leaderboard`. (Nếu định vị sản phẩm coi trọng quyền riêng tư, có thể cân nhắc đổi sang opt-in).\n  - Client gửi debounce search query (tối thiểu 3 ký tự, delay 350ms).\n  - RPC `search_players(p_query, p_limit)` chạy với `SET search_path = \'\'` và kiểm tra gắt gao `auth.uid()` để đảm bảo bảo mật (Security Definer Hardening).\n  - Rate limit tích hợp ở tầng CSDL: Gọi RPC `check_rate_limit(uid, \'search_players\', 15, 300)` chặn không cho spam (15 request / 5 phút).\n  - Trả về tối đa `p_limit = 10` kết quả.\n'
);
fs.writeFileSync('docs/feature_gamification_social.txt', social);

let scoring = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');
// Fix rating_model_version
scoring = scoring.replace(
  '4.4 BẢNG XẾP HẠNG (LEADERBOARD) - PHÂN HẠNG VÀ PHẦN TRĂM DÂN SỐ\n\nĐể đánh giá người chơi so với cộng đồng, hệ thống sử dụng bảng `population_stats` (cập nhật qua cron job hàng đêm).',
  '4.4 BẢNG XẾP HẠNG (LEADERBOARD) - PHÂN HẠNG VÀ PHẦN TRĂM DÂN SỐ\n\n- Phiên bản mô hình chấm điểm (`rating_model_version`): Được thêm vào `profiles` để theo dõi phiên bản thuật toán chấm điểm của user (bổ sung cho `scorer_version` của từng ván). Khi lấy số liệu quần thể, view `profiles_decayed` và hàm `get_population_stats` sẽ lọc trực tiếp theo `rating_model_version` để tránh trộn điểm cũ và mới.\n\nĐể đánh giá người chơi so với cộng đồng, hệ thống sử dụng bảng `population_stats` (cập nhật qua cron job hàng đêm).'
);
fs.writeFileSync('docs/feature_games_scoring.txt', scoring);

// Remove duplicate Phase 26/27 from docs_for_review if needed, but we'll regenerate docs_for_review anyway.
