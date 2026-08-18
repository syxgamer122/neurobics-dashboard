const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [pattern, replacement] of replacements) {
        content = content.replace(pattern, replacement);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

// 1. Hard reject nguyên tử
replaceInFile('docs/feature_anticheat_observability.txt', [
    [/\* Cập nhật Atomic: `UPDATE round_tickets SET state = 'rejected', submitted_at = now\(\) WHERE processing_token = \.\.\.`\n\s+\* Gọi RPC `record_cheat_flag` lưu chi tiết cờ Hard vào DB\./g, 
     `* Gọi RPC duy nhất \`finalize_rejected_round_tx\` (kiểm tra processing_token -> khóa ticket -> chuyển state thành rejected -> ghi toàn bộ cheat flags -> ghi observability -> commit).`],
    [/Gọi RPC `submit_round_transaction` cập nhật/g, `Gọi RPC \`submit_round_transaction\` (kiểm tra processing_token atomic) cập nhật`]
]);

// 2. Guest upgrade
replaceInFile('docs/adr/0009-guest-account-upgrade.md', [
    [/5\. \*\*completed\*\*: Trigger trong Postgres.*?\./s, 
     `5. **completed**: Trigger Postgres chỉ đánh dấu \`email_verified\`. Quá trình promote thực sự dùng RPC \`finalize_guest_upgrade_tx\` (khóa upgrade_operation -> xác minh \`old_sessions_revoked\`, \`target_email\`, \`expired/consumed\` -> update \`role = user\` -> update operation = \`completed\` -> commit).
   Sau hoàn tất: Yêu cầu đăng nhập lại. Từ chối các token được phát trước \`upgraded_at\`.`],
    [/bảo mật tuyệt đối/gi, `bảo mật cao`],
    [/chống session hijacking tuyệt đối/gi, `hạn chế tối đa session hijacking`]
]);

// 3. MFA Freshness
replaceInFile('docs/adr/0010-admin-mfa.md', [
    [/require recent step-up <= 5 phút/g, `require active step-up grant <= 5 phút (kiểm tra bảng \`admin_step_up_grants\`)`],
    [/yêu cầu auth_time \(recent step-up\) tối đa 5 phút/g, `yêu cầu sinh một step-up grant (\`admin_step_up_grants\`) có hiệu lực tối đa 5 phút sau khi giải TOTP`],
    [/triệt tiêu 99%/gi, `giảm thiểu đáng kể`],
    [/jsonwebtoken hoặc parser tương đương/gi, `jose.jwtVerify`]
]);

// 4. Account deletion 3 bước -> Journal
const accountDeletionReplacement = `Tiến trình xóa sử dụng Operation Journal (bảng \`account_deletion_operations\`):
- \`requested\`
- \`storage_deleted\`
- \`auth_deleted\`
- \`database_cleaned\`
- \`completed\`
Mỗi bước đều Idempotent, có \`attempt_count\`, \`last_error\`, có thể retry, lưu audit và đảm bảo duy nhất một operation active trên mỗi user. Trả về 202 Accepted cho API.`;

replaceInFile('docs/feature_admin.txt', [
    [/Xóa Storage\s*->\s*Xóa Auth\s*->\s*Xóa Profile/gi, accountDeletionReplacement],
    [/LUỒNG 4: XÓA NGƯỜI DÙNG \(DELETE USER\)[\s\S]*?\[Background Worker \/ Edge Function Async\][\s\S]*?completed`\./, `LUỒNG 4: XÓA NGƯỜI DÙNG (DELETE USER)\n${accountDeletionReplacement}`],
    [/\/rest\/v1\/profiles/g, `GET /server/admin-users`]
]);

replaceInFile('docs/feature_auth_profile.txt', [
    [/Xóa Storage\s*->\s*Xóa Auth\s*->\s*Xóa Profile/gi, accountDeletionReplacement]
]);

// 5. Contract server challenge
replaceInFile('docs/feature_games_scoring.txt', [
    [/\{ roundId, game, startedAt, expiresAt \}/g, `{ roundId, game, publicChallenge, configVersion, startedAt, expiresAt }`],
    [/\* Lưu ý: Khởi tạo ván chơi/g, `DB lưu \`public_challenge\`, \`private_challenge\`, \`challenge_hash\`, \`config_version\`. Khi submit, server dùng challenge trong ticket, không dùng config do client khai.\n* Lưu ý: Khởi tạo ván chơi`]
]);

// 6. IndexedDB LocalStorage
replaceInFile('docs/feature_offline_pwa.txt', [
    [/const queue = getOfflineQueue\(\);\s*if \(queue\.length >= MAX_QUEUE\) \{[\s\S]*?writeOfflineQueue\(queue\);/g, 
     `if (await countPendingRounds(userId) >= MAX_QUEUE) { throw new QueueFullError(); }\nawait db.put("offlineRounds", { ...round, userId, clientRoundId: crypto.randomUUID(), status: "pending", attemptCount: 0, nextRetryAt: null, createdAt: new Date().toISOString() });`],
    [/FIFO đẩy ván cũ nhất/g, `chặn round mới và cảnh báo`],
    [/IndexedDB thay vì IndexedDB/g, `IndexedDB thay vì LocalStorage`]
]);

// 7. RT 80ms
replaceInFile('docs/feature_anticheat_observability.txt', [
    [/const safeAccuracy = clamp01\(accuracy\);/g, `const safeAccuracy = clamp01(accuracy);\nconst safeLapseFactor = clamp01(1 - lapseRate * 1.15);\nconst safeFaRate = clamp01(faRate);\nconst safeErrorRate = clamp01(errorRate);`],
    [/400 \| 401 \| 409 \| 410 \| 422/g, `400 | 401 | 403 | 409 | 410 | 413 | 422 | 429`],
    [/\(400, 401, 409, 410, 422\)/g, `(400, 401, 403, 409, 410, 413, 422, 429)`]
]);

replaceInFile('docs/feature_games_scoring.txt', [
    [/Math\.pow\(1 - faRate, 0\.9\)/g, `Math.pow(clamp01(1 - safeFaRate), 0.9)`],
    [/Math\.pow\(1 - errorRate, 1\.2\)/g, `Math.pow(clamp01(1 - safeErrorRate), 1.2)`],
    [/targets = 0/gi, `Từ chối targets = 0 hoặc nonTargets = 0`],
    [/Góc xoay/g, `Góc xoay (radians)`]
]);

// 8. Miscellaneous Drifts
replaceInFile('docs/runbook.md', [
    [/giảm INSPECTOR_VERSION/gi, `tăng version thay vì giảm`],
    [/xóa cheat_flags/gi, `cấp compensation và giữ nguyên cheat_flags`]
]);

replaceInFile('docs/feature_offline_pwa.txt', [
    [/cập nhật Rating trục, XP, và lịch sử/g, `cập nhật practice_xp và last_activity_at (KHÔNG update Rating/XP competitive)`],
    [/ghi đè kết quả thật/g, `ghi kết quả offline`]
]);

replaceInFile('docs/known-issues.md', [
    [/\| runbook\.md \|\s*\| runbook\.md \|/g, `| runbook.md |`]
]);

replaceInFile('docs/feature_gamification_social.txt', [
    [/Vite\/React \/ React/g, `Vite/React`]
]);

replaceInFile('docs/feature_ui_dashboard.txt', [
    [/event\.origin !== window\.location\.origin/g, `event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow`]
]);

replaceInFile('docs/privacy-and-terms.md', [
    [/observability_events\` are kept for 90 days/g, `observability_events\` are kept for 90 days (Đồng bộ Data Retention Policy)`],
    [/Irreversibly hashed fingerprint/gi, `pseudonymized fingerprint (keyed HMAC rotated)`],
    [/standard hosting providers/gi, `Vercel (Frontend), Supabase (Backend/DB)`]
]);

replaceInFile('docs/data-retention.md', [
    [/30 ngày/g, `90 ngày (đối với observability_events)`]
]);

console.log('Script execution complete.');
