const fs = require('fs');

// 0009-guest-account-upgrade.md
let upgradeContent = fs.readFileSync('docs/adr/0009-guest-account-upgrade.md', 'utf8');
upgradeContent = upgradeContent.replace(/1\. \*\*pending_verification.*?\n5\. \*\*completed\*\*.*?\./s, 
`1. **pending_verification**: Guest gọi API /server/upgrade-account với email thực. Hệ thống sinh một \`upgrade_operations\` cho user với trạng thái pending, rồi gọi Supabase Auth gửi OTP.
2. **email_verified**: User nhập OTP thành công trên Supabase Auth.
3. **credentials_bound**: Server thiết lập mật khẩu mới do người dùng cung cấp.
4. **old_sessions_revoked**: Revoke toàn bộ JWT / session cũ của guest proxy để chống rò rỉ.
5. **completed**: Trigger trong Postgres phát hiện sự thay đổi (\`NEW.email IS DISTINCT FROM OLD.email\` VÀ \`NEW.email = target_email\`), tự động thăng cấp \`profiles.role\` từ \`guest\` lên \`user\`, hoàn tất operation.

Các trạng thái lỗi của operation:
- \`expired\`: Operation quá hạn.
- \`failed\`: Lỗi hệ thống hoặc sai mật khẩu.
- \`cancelled\`: Bị thay thế bằng operation mới.

Mỗi transition cần kiểm tra:
- Operation thuộc đúng user.
- User hiện vẫn là guest.
- Email mới khớp với target_email của operation.
- Operation chưa hết hạn và chưa bị consumed.
- Chỉ có tối đa một operation pending trên mỗi user (unique constraint).
- Replay attack được xử lý bằng kết quả idempotent.`);

fs.writeFileSync('docs/adr/0009-guest-account-upgrade.md', upgradeContent, 'utf8');

// Also fix runbook.md
let runbookContent = fs.readFileSync('docs/runbook.md', 'utf8');
runbookContent = runbookContent.replace(/Append manual_review\n.*?không xóa cheat_flags/s, 
`Append manual_review -> mark false_positive -> cấp compensation nếu cần -> tuyệt đối KHÔNG xóa cheat_flags (append-only ledger).`);
runbookContent = runbookContent.replace(/Không bao giờ giảm version\. Nếu logic mới sai.*?\)/s, 
`Không bao giờ giảm version. Nếu logic phiên bản mới sai, hãy revert code logic về bản cũ nhưng BẮT BUỘC TĂNG version (ví dụ: v3 lỗi, rollback logic về giống v2 nhưng gán version v4).`);
fs.writeFileSync('docs/runbook.md', runbookContent, 'utf8');
