const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'docs/feature_auth_profile.txt');
let c = fs.readFileSync(p, 'utf8');

// 1. Guest Upgrade SSOT
c = c.replace(/chỉ việc Update Email và Password thật/g, 'chỉ được gọi RPC `finalize_guest_upgrade_tx` (xem ADR-0009)');
c = c.replace(/RPC `finalize_guest_upgrade_tx` \(xem ADR-0009 SSOT\)/g, 'RPC `finalize_guest_upgrade_tx` (xem ADR-0009 SSOT)'); // clean up from V5 just in case

// 2. Direct Deletion removal (purge Architecture B)
// Look for direct auth/storage deletion in section I
c = c.replace(/Xóa tài khoản \(A–D\)[^]*?sơ đồ signup\/login\/avatar\/delete/g, 'Xóa tài khoản (Journal Only)\nSơ đồ: signup -> login -> avatar -> delete_journal');
// Note: If I can't hit it precisely with regex, I'll just append notes at the end of the file. But I should try to replace.

// 3. RLS and Negative Tests
const negativeTests = `
Negative Tests Bắt Buộc (RLS & Security Definer):
User thường KHÔNG THỂ:
1. Sửa \`role\`
2. Sửa \`admin_capabilities\`
3. Sửa \`total_xp\`
4. Sửa năm trục điểm
5. Sửa \`stats_generation\`
6. Insert \`xp_events\`
7. Insert \`training_sessions\`
8. Gọi RPC admin
9. Đọc friend leaderboard khi chưa accepted
10. Chỉnh avatar URL sang path của user khác
`;
if (!c.includes('Negative Tests Bắt Buộc')) {
  c = c + '\n' + negativeTests;
}

// 4. IP Hashing & Rate Limits
c = c.replace(/SHA-256\("mindgem-signup:" \+ ip\)/g, 'HMAC-SHA256(rotating_secret, canonical_ip)');
c = c.replace(/Rate Limit theo IP \(60\/phút\)/g, 'Rate Limit theo IP (60/phút) kèm Turnstile cho cả Login/Signup để chống credential stuffing');

// 5. Explicit Avatar & Birth Year RPC
c = c.replace(/Gọi `auth\.updateUser` cập nhật mật khẩu mới/g, 'Gọi `auth.updateUser` cập nhật mật khẩu mới (Các thao tác profile khác phải qua RPC như `update_my_avatar`, `update_my_birth_year`)');

fs.writeFileSync(p, c);
console.log("Auth purged.");
