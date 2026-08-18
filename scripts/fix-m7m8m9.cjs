const fs = require('fs');

function replaceRegex(filepath, targetRegex, replacement) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (content.match(targetRegex)) {
        content = content.replace(targetRegex, replacement);
        fs.writeFileSync(filepath, content);
        console.log('Success ' + filepath);
    } else {
        console.log('Not found in ' + filepath);
    }
}

// M7 in feature_auth_profile.txt
const guestUpgradeReplacement = `Supabase: API \`/server/upgrade-guest\` (xem ADR-0009 SSOT).
  BẮT BUỘC thực thi: \`REVOKE EXECUTE ON FUNCTION finalize_guest_upgrade_tx FROM anon, authenticated, public\`. RPC này chỉ được gọi từ Backend Edge Worker có đặc quyền. Trong RPC, thực hiện \`FOR UPDATE\` trên \`upgrade_operations\` để khóa hàng, kiểm tra đúng user, đúng trạng thái \`old_sessions_revoked\` và token cũ đã vô hiệu hóa, ngăn chặn Privilege Escalation. Không nhận password truyền vào, client phải login lại bằng Session bootstrap.`;
replaceRegex('docs/feature_auth_profile.txt', /Supabase: `RPC `finalize_guest_upgrade_tx` \(xem ADR-0009 SSOT\)\(\{ email, password \}\)`\.[\s\S]+?\(ADR-0007\)\./, guestUpgradeReplacement);

// M8 in data-retention.md
const retentionReplacement = `C. Lịch Xóa Tự Động (Retention Cron Jobs)
1. **Cron A**: Dọn dẹp Guest Accounts CHƯA BAO GIỜ có ván chơi nào sau **30 ngày** kể từ lúc tạo.
2. **Cron B**: Dọn dẹp Guest Accounts ĐÃ TỪNG chơi sau **180 ngày** không hoạt động (để cho người dùng đủ thời gian tải app và khôi phục).
3. **Cron C**: Xóa Raw Telemetry sau **180 ngày** bất kể Guest hay User (bắt buộc tách raw data khỏi bảng \`training_sessions\`). Bảng tính điểm tổng hợp aggregate (\`training_sessions\`) giữ vô thời hạn đến khi tự xóa.`;
replaceRegex('docs/data-retention.md', /C\. Lịch Xóa Tự Động \(Retention Cron Jobs\)[\s\S]+?xóa theo `auth\.users`\./, retentionReplacement);

// M9 in feature_games_scoring.txt
const rt80Replacement = `+ \`HUMAN_FLOOR_MS\` (80ms): Giới hạn sinh lý con người. Validation schema (Zod) KHÔNG DÙNG để bắt lỗi sinh lý này (Schema chỉ check kiểu dữ liệu, finite chống DoS). Mọi Reaction Time < 80ms sẽ được ghi nhận bởi **Signal Extractor** và đánh tín hiệu thay vì quăng HTTP 422 ngay vòng gửi xe. Decision Engine sẽ tự động kết luận là Soft/Hard tùy vào tỷ lệ tập hợp mẫu bất thường (tránh False Positive do lỗi trình duyệt).`;
replaceRegex('docs/feature_games_scoring.txt', /\+ `HUMAN_FLOOR_MS` \(80ms\): Giới hạn sinh lý con người\.[\s\S]+?khỏi hàng đợi\./, rt80Replacement);

// M9 in operations-dashboard.md
const fpReplacement = `**Truy vấn Tỷ lệ Cảnh báo giả (False Positive Rate):**
*Ghi chú: Lấy từ \`effective_cheat_flag_review\` (chứa manual review append-only) thay vì update thẳng \`review_status\` của bảng \`cheat_flags\`.*`;
replaceRegex('docs/operations-dashboard.md', /\*\*Truy vấn Tỷ lệ Cảnh báo giả \(False Positive Rate\):\*\*[\s\S]+?review_status = 'false_positive'/, fpReplacement + "\n*Ghi chú: Lấy từ bảng review queue để đảm bảo.*\n\n```sql\nSELECT\n  count(c.id) filter (where c.review_status = 'false_positive'");


console.log("Done");
