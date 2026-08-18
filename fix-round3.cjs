const fs = require('fs');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) {
        console.log('File not found: ' + filePath);
        return;
    }
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

// 1. Version đóng băng
replaceInFile('docs/version-policy.md', [
    [/Round được score bằng version hiện tại lúc server xử lý/gi, 'Lưu đầy đủ version trên `round_tickets` khi start-round (`scorer_version`, `inspector_version`, `shared_inspector_version`, `telemetry_schema_version`, `config_version`). Khi submit, dùng chính các version này từ ticket để chấm điểm.']
]);

// 2. Guest signup bootstrap code
replaceInFile('docs/feature_auth_profile.txt', [
    [/server tạo tài khoản rồi trả mật khẩu ngẫu nhiên để client tự đăng nhập/gi, 'server tạo tài khoản và trả về một bootstrap code ngẫu nhiên (30-60 giây, dùng một lần). Client đổi bootstrap code lấy session qua `/server/guest-session/exchange`. Server chỉ lưu hash của code. Mọi response có `Cache-Control: no-store`, không log request/response body.']
]);

// 3. MFA ADR
replaceInFile('docs/adr/0010-admin-mfa.md', [
    [/jsonwebtoken hoặc parser tương đương/gi, 'jose.jwtVerify'],
    [/AAL2 sống 1–4 giờ/gi, 'AAL2 yêu cầu step-up grant ≤5 phút'],
    [/dựa vào iat của JWT làm bằng chứng/gi, 'dựa vào bảng `admin_step_up_grants` làm bằng chứng']
]);

// 4. Account Deletion Orchestration
const deletionFlow = `Dùng chung một deletion state machine cho self-delete và admin-delete:
- requested
- storage_deleted
- auth_deleted
- database_cleaned
- completed

Mỗi operation cần: \`idempotency_key\`, \`target_user_id\`, \`actor_user_id\`, \`state\`, \`attempt_count\`, \`last_error\`, \`next_retry_at\`, \`completed_at\`.
API trả 202 Accepted nếu thao tác đang tiếp tục. Self-delete yêu cầu recent reauthentication.`;

replaceInFile('docs/feature_admin.txt', [
    [/Xóa Storage[\s\S]*?trả thành công/g, deletionFlow]
]);
replaceInFile('docs/feature_auth_profile.txt', [
    [/Xóa Storage[\s\S]*?trả thành công/g, deletionFlow]
]);

// 5. Practice RPC
replaceInFile('docs/feature_offline_pwa.txt', [
    [/submit_offline_practice_tx: cập nhật Rating trục, XP và lịch sử/gi, 'submit_offline_practice_tx: INSERT practice_sessions, UPDATE last_activity_at, cấp practice_xp/streak bị giới hạn, enforce idempotency thông qua `UNIQUE (user_id, client_round_id)`, KHÔNG update rating, KHÔNG update competitive total_xp, KHÔNG update PB, KHÔNG mở achievement cạnh tranh.']
]);

// 6. Scoring math
replaceInFile('docs/feature_games_scoring.txt', [
    [/1 - lapseRate \* 1\.15/g, 'clamp01(1 - lapseRate * 1.15)'],
    [/accuracy \*\* 1\.15/g, 'clamp01(accuracy) ** 1.15'],
    [/\(1 - errorRate\) \*\* 1\.2/g, 'Math.pow(clamp01(1 - clamp01(errorRate)), 1.2)'],
    [/targets <= 0 \|\| nonTargets <= 0/gi, 'targets <= 0 || nonTargets <= 0'],
    [/angleDegrees \* Math\.PI \/ 180/gi, 'angleDegrees * Math.PI / 180'],
    [/Math\.abs\(Math\.sin\(radians \/ 2\)\)/gi, 'Math.abs(Math.sin(radians / 2))']
]);
replaceInFile('docs/feature_anticheat_observability.txt', [
    [/score > 80/g, 'Dùng raw fields (targetsFound, responses, misses) để đánh giá. Không phụ thuộc điểm số do client tính.']
]);

// 7. Retention
replaceInFile('docs/data-retention.md', [
    [/Không hoạt động trong 90 ngày \.\.\. < now\(\) - interval '30 days'/gi, 'Guest chưa chơi: xóa 30 ngày. Guest đã chơi nhưng không nâng cấp: 90-180 ngày không hoạt động.']
]);
replaceInFile('docs/observability.md', [
    [/select public\.prune_observability_events\(30\);/gi, 'select public.prune_observability_events(90);'],
    [/giữ 30 ngày/g, 'giữ 90 ngày']
]);

// 8. Runbook
replaceInFile('docs/runbook.md', [
    [/có thể xóa flag oan/gi, 'append `manual_review(false_positive)` -> append compensation -> khôi phục capability -> BẮT BUỘC giữ nguyên `cheat_flags`.'],
    [/revert INSPECTOR_VERSIONS về version trước/gi, 'Không được giảm version. Rollback bằng cách lấy logic cũ lưu vào version lớn hơn.'],
    [/chỉ rollback frontend/gi, 'phải redeploy bộ frontend-server-schema tương thích hoặc roll-forward.']
]);

// 9. CI tests
replaceInFile('docs/ci.md', [
    [/test:round-concurrency/gi, 'test:round-concurrency'],
    [/test:offline-isolation/gi, 'test:offline-isolation'],
    [/## 1\. Luồng CI/g, '## 1. Luồng CI\n- `test:round-concurrency`\n- `test:offline-isolation`\n- `test:guest-upgrade`\n- `test:admin-step-up`\n- `test:account-deletion-resume`\n- `test:rls-negative`\n- `test:migration-upgrade-snapshot`\n- `test:scoringuzz`\n- `test:a11y`\n- `scan:docs`\n']
]);

// P2 issues
replaceInFile('docs/feature_ui_dashboard.txt', [
    [/React \/ Next\.js UI/gi, 'Vite/React UI'],
    [/theme="dark"/g, 'theme={currentTheme}'],
    [/Theme vẫn được mô tả lưu IndexedDB/gi, 'Theme lưu `localStorage`.'],
    [/kiểm tra origin hai lần/g, 'kiểm tra origin và source.']
]);
replaceInFile('docs/adr/0007-gamification.md', [
    [/signup payload rỗng/gi, 'signup payload chứa Turnstile token']
]);
replaceInFile('docs/adr/0003-typescript-zod.md', [
    [/type-safety tuyệt đối/gi, 'type-safety mạnh mẽ']
]);
replaceInFile('docs/architecture.md', [
    [/DB trigger promote guest/gi, 'finalize RPC `finalize_guest_upgrade_tx` để promote guest']
]);
replaceInFile('docs/implementation-report.md', [
    [/omit 429/gi, '429 tính là availability failure']
]);

console.log('Done');
