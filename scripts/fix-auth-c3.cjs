const fs = require('fs');
const path = require('path');

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

const signupReplacement = `
- Cấp phát Account: Server gọi \`adminClient.auth.admin.createUser\` tạo một tài khoản Supabase Auth thực sự (email giả định do server tự sinh, kèm password bắt buộc).
  \`\`\`typescript
  const { data, error } = await adminClient.auth.admin.createUser({
    email: \`\${normalizedUsername}@mindgem.local\`,
    password, // Cần truyền password do người dùng chọn
    email_confirm: true,
    user_metadata: { username: normalizedUsername },
  });
  \`\`\`
- Tài khoản Guest: Server sinh mật khẩu ngẫu nhiên để tạo Auth user:
  \`\`\`typescript
  const guestPassword = \`\${crypto.randomUUID()}-\${crypto.randomUUID()}\`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email: \`\${crypto.randomUUID()}@mindgem.local\`,
    password: guestPassword,
    email_confirm: true,
    app_metadata: { account_type: "guest" },
  });
  \`\`\`
  > Response trả về guest password phải có \`Cache-Control: no-store\`, không được ghi vào log server, client gọi \`signInWithPassword\` ngay lập tức và không lưu mật khẩu vĩnh viễn (dựa vào session refresh token).`;

replaceRegex(
    'docs/feature_auth_profile.txt',
    /- Cấp phát: Server gọi `adminClient\.auth\.admin\.createUser`[\s\S]+?\(xem ADR-0009\)\./,
    signupReplacement
);

const avatarReplacement = `
- Tải ảnh đại diện (\`update_my_avatar\`):
  1. Kiểm tra magic bytes, giới hạn pixel, decode/re-encode, xóa EXIF, chặn file polyglot (không chỉ tin tưởng MIME type). Kích thước \`<= 2MB\`.
  2. Xác định đường dẫn file: \`\${userId}/avatar.\${ext}\`.
  3. Client tải ảnh lên Storage \`avatars\`.
  4. Client gọi RPC \`update_my_avatar(p_object_path)\` truyền đường dẫn file (\`object_path\`), KHÔNG phải truyền public URL.
     Hàm SQL Security Definer sẽ tự parse đường dẫn: \`IF split_part(p_object_path, '/', 1) <> auth.uid()::text THEN RAISE EXCEPTION\`. Nếu hợp lệ, tự \`build_avatar()\` thành URL để ghi vào \`profiles\`.`;

replaceRegex(
    'docs/feature_auth_profile.txt',
    /- Tải ảnh đại diện \(`update_my_avatar`\):[\s\S]+?bằng `profiles`\)\./,
    avatarReplacement
);

console.log("Done");
