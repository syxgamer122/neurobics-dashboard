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

// 1. Sync states in feature_admin.txt
const adminJournal = `   Tiến trình xóa sử dụng Operation Journal chung (orchestration) cho cả Self-delete và Admin-delete qua bảng \`account_deletion_operations\`:
   - \`requested\`
   - \`sessions_revoked\`
   - \`storage_deleted\`
   - \`database_cleaned\`
   - \`auth_deleted\`
   - \`completed\``;

replaceRegex(
    'docs/feature_admin.txt',
    /Tiến trình xóa sử dụng Operation Journal[\s\S]+?- `completed`/,
    adminJournal
);

// 2. feature_auth_profile.txt polling logic
const pollingReplacement = `  - Trạng thái được đặt thành \`deletion_pending\`, khóa toàn bộ write request mới.
  - Sau khi Auth bị xóa (\`auth_deleted\`), client sẽ không còn token để tiếp tục gọi DB, nên Endpoint status chỉ nhận Opaque Token không định danh thay vì JWT.`;

replaceRegex(
    'docs/feature_auth_profile.txt',
    /- Đảm bảo Journal không bị cascade xóa theo `auth\.users`\. Tự xóa hoàn toàn các logic Delete Auth\/Storage trực tiếp khỏi mã nguồn\./,
    "- Đảm bảo Journal không bị cascade xóa theo `auth.users`. Tự xóa hoàn toàn các logic Delete Auth/Storage trực tiếp khỏi mã nguồn.\n" + pollingReplacement
);

// 3. Remove direct rating set in feature_admin.txt
const appendOnlyReplacement = `Admin có thể chỉnh sửa rating hoặc XP của người dùng thông qua việc phát hành các bản ghi Append-only vào bảng \`rating_correction_events\` hoặc \`xp_events\`. Các projection sẽ được tính toán lại dựa trên dữ liệu này, giữ nguyên vẹn \`training_sessions\` gốc, đảm bảo tính bất biến (Immutable).`;

replaceRegex(
    'docs/feature_admin.txt',
    /Admin có quyền can thiệp vào dữ liệu người dùng như chỉnh sửa điểm số \(Rating, XP\) qua RPC `admin_update_user_stats`/,
    appendOnlyReplacement
);

console.log("Done");
