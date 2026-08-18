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

const avatarReplacement = `
- Tải ảnh đại diện (\`update_my_avatar\`):
  1. Kiểm tra magic bytes, giới hạn pixel, decode/re-encode, xóa EXIF, chặn file polyglot (không chỉ tin tưởng MIME type). Kích thước \`<= 2MB\`.
  2. Xác định đường dẫn file: \`\${userId}/avatar.\${ext}\`.
  3. Client tải ảnh lên Storage \`avatars\`.
  4. Client gọi RPC \`update_my_avatar(p_object_path)\` truyền đường dẫn file (\`object_path\`), KHÔNG phải truyền public URL.
     Hàm SQL Security Definer sẽ tự parse đường dẫn: \`IF split_part(p_object_path, '/', 1) <> auth.uid()::text THEN RAISE EXCEPTION\`. Nếu hợp lệ, tự \`build_avatar()\` thành URL để ghi vào \`profiles\`.`;

// Using more forgiving regex
replaceRegex(
    'docs/feature_auth_profile.txt',
    /- Tải ảnh đại diện \(`update_my_avatar`\):[\s\S]+?bằng `profiles`\)\./,
    avatarReplacement
);

console.log("Done");
