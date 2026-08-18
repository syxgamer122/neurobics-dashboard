const fs = require('fs');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [pattern, replacement] of replacements) {
        content = content.replace(pattern, replacement);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated ' + filePath);
    }
}

// Missed ADRs
replaceInFile('docs/adr/0007-guest-server-side.md', [
    [/signup payload rỗng/gi, 'signup payload chứa Turnstile token']
]);
replaceInFile('docs/adr/0003-typed-registry.md', [
    [/type-safety tuyệt đối/gi, 'type-safety mạnh mẽ']
]);
replaceInFile('docs/architecture-contracts.md', [
    [/DB trigger promote guest/gi, 'finalize RPC `finalize_guest_upgrade_tx` để promote guest']
]);

// Migration issues
replaceInFile('docs/migrations.md', [
    [/Blanket IF NOT EXISTS/gi, 'Blanket IF NOT EXISTS có thể che schema drift. Migration bình thường nên fail-fast.'],
    [/-- allow-destructive tắt toàn bộ kiểm tra của file/gi, '-- allow-destructive không nên tắt mọi kiểm tra của file, cần dùng statement-level approval và review thứ hai.'],
    [/Long-running migration/gi, 'Long-running migration cần lock_timeout, statement_timeout, batched backfill và index concurrent khi phù hợp.']
]);

// Premint pool ADR
replaceInFile('docs/adr/0008-premint-ticket-pool.md', [
    [/lợi ích/gi, 'Lưu ý: Chỉ giữ nếu benchmark chứng minh cải thiện p95/p99. Một UPDATE vẫn tạo WAL và dead tuples, không loại bỏ Edge cold-start.']
]);

// Brain Age
replaceInFile('docs/feature_games_scoring.txt', [
    [/Năm round/g, '5 round: trạng thái "đang hiệu chuẩn". Yêu cầu 20-30 online rounds với độ phủ ít nhất 4/5 trục. Hiển thị confidence score. Bắt buộc không dùng wording mang tính chẩn đoán y tế.']
]);

// Misc UI check for feature_ui_dashboard
replaceInFile('docs/feature_ui_dashboard.txt', [
    [/theme="dark"/gi, 'theme={currentTheme}']
]);

console.log('Done round 4');
