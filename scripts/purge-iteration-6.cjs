const fs = require('fs');
const path = require('path');
const docsPath = path.join(process.cwd(), 'docs');

function replaceInFile(fileName, searches, replacements) {
  const p = path.join(docsPath, fileName);
  let c = fs.readFileSync(p, 'utf8');
  for (let i = 0; i < searches.length; i++) {
    c = c.replace(searches[i], replacements[i]);
  }
  fs.writeFileSync(p, c);
  console.log(`Updated ${fileName}`);
}

// 1. feature_gamification_social.txt
replaceInFile('feature_gamification_social.txt', [
  /CREATE UNIQUE INDEX friendships_unique_pair/g,
  /vừa nói không sync achievement trên mount/g
], [
  'ALTER TABLE public.friendships ADD CONSTRAINT friendships_not_self CHECK (user_id <> friend_id);\nCREATE UNIQUE INDEX friendships_unique_pair\nON public.friendships (\n  LEAST(user_id, friend_id),\n  GREATEST(user_id, friend_id)\n);',
  'Tuyệt đối không gọi sync_achievements trên mount, tránh race condition.'
]);

// 2. monitoring-alerts.md
replaceInFile('monitoring-alerts.md', [
  /Kiểm tra Body \$\\le 32KB\$/g
], [
  'Kiểm tra Body $\\le 32KB$ (Lưu ý: Dùng `new TextDecoder().decode(bytes)` để tính byte UTF-8 thực tế thay vì độ dài JS String)'
]);

// 3. feature_admin.txt
replaceInFile('feature_admin.txt', [
  /React\/Next\.js/g,
  /không role nào, kể cả superuser, có thể update\/delete/g,
  /xoá tài khoản trực tiếp/g
], [
  'React/Vite',
  'RLS không thể ngăn chặn PostgreSQL superuser hoặc DB Owner. Bắt buộc kết hợp với external WORM storage để tạo hệ thống kiểm toán thực sự.',
  'Operation Journal (xem Deletion Flow)'
]);

// 4. privacy-and-terms.md and data-retention.md
replaceInFile('data-retention.md', [
  /Guest đã chơi: 90–180 ngày/g,
  /Cron B: xoá sau 30 ngày/g,
  /Completed journal: 7–30 ngày/g
], [
  'Guest đã chơi: 180 ngày (thống nhất)',
  'Guest chưa chơi: 30 ngày',
  'Completed journal: 7 ngày (khớp với Privacy Policy)'
]);

// 5. feature_anticheat_observability.txt
replaceInFile('feature_anticheat_observability.txt', [
  /Kiểm tra Body \$\\le 32KB\$/g,
  /Đóng băng Pipeline xử lý: Invariant -> Chuẩn hóa -> Tín hiệu -> Quyết định/g
], [
  'Kiểm tra Body $\\le 32KB$ (tính bằng TextDecoder)',
  'Đóng băng Pipeline xử lý bằng Decision Engine tập trung `decide(signals: Signal[])`. Các hàm inspector của từng game CHỈ sinh ra tín hiệu `Signal { kind, mode }` thay vì tự quyết định HTTP 422. Hard Reject YÊU CẦU >= 2 tín hiệu thống kê ĐỘC LẬP hoặc 1 tín hiệu vật lý. Rule mới bắt buộc qua Shadow Mode'
]);

// 6. runbook.md (MFA Steps & Migration Checksums)
replaceInFile('runbook.md', [
  /Chỉ cần Project Owner xóa MFA factor/g,
  /CREATE TABLE IF NOT EXISTS/g
], [
  'Quy trình MFA Recovery gồm 9 bước nghiêm ngặt: (1) Xác minh danh tính ngoài hệ thống, (2) Two-person approval, (3) Revoke toàn bộ session, (4) Xóa mọi admin_step_up_grants, (5) Xóa factor cũ, (6) Buộc enroll factor mới, (7) Rotate password/recovery code, (8) Ghi external audit, (9) Tạm khóa capability cho đến khi hoàn tất.',
  'CẢNH BÁO: Không dùng `IF NOT EXISTS` vì nó che giấu schema drift. Yêu cầu Schema diff checksum, baseline rõ ràng và phê duyệt thủ công cho mọi migration.'
]);

console.log("All legacy contracts purged successfully.");
