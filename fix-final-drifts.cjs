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
        console.log(`Updated ${filePath}`);
    }
}

// 1. P1 - Accepted round nguyên tử
replaceInFile('docs/feature_anticheat_observability.txt', [
    [/Duyệt mảng Soft flags và gọi RPC `record_cheat_flag` cho từng cờ\.[\s\S]*?cập nhật các trục nhận thức, điểm số và XP vào DB\./g, 
`Thực hiện duy nhất một RPC \`finalize_accepted_round_tx\`:
     (SELECT ticket FOR UPDATE -> xác minh processing_token & state = processing -> insert soft flags -> link/update device -> insert training_session -> insert xp_event -> update profile projection -> state = accepted -> insert outbox event -> commit).`],
    [/Log sự kiện cảnh báo server `anticheat\.hard_reject`\./g, `Log sự kiện cảnh báo server \`anticheat.hard_reject\`.\n\n   * CƠ CHẾ PHỤC HỒI (Processing Lease):\n     Có cron job định kỳ chạy \`UPDATE round_tickets SET state = 'issued', processing_token = NULL, attempt_count = attempt_count + 1 WHERE state = 'processing' AND processing_started_at < now() - interval '2 minutes' AND attempt_count < 3\`. Quá 3 lần sẽ chuyển sang \`failed\`.`]
]);

// 2. P1 - Offline practice contract
replaceInFile('docs/feature_offline_pwa.txt', [
    [/cập nhật practice_xp và last_activity_at \(KHÔNG update Rating\/XP competitive\)/g, `insert practice_sessions, update last_activity_at, cấp practice_xp/streak có giới hạn, enforce idempotency thông qua \`UNIQUE (user_id, client_round_id)\` trên bảng practice_sessions. Tuyệt đối KHÔNG chạm vào competitive state (rating, PB, level, achievement). Không mint \`round_tickets\` thật cho practice offline.`],
    [/const freshQueue = getOfflineQueue\(\);[\s\S]*?writeOfflineQueue\(newQueue\);/g, 
`await navigator.locks.request(
  \`offline-sync:\${userId}\`,
  async () => {
    const batch = await getPendingBatch(userId, 25);
    await markAsSyncing(batch.map(x => x.clientRoundId));
    const results = await syncOfflineRounds(batch);

    await db.transaction("readwrite", ["offlineRounds"], async () => {
      for (const result of results) {
        if (result.status === "ok" || result.status === "duplicate" || result.status === "rejected") {
          await deleteRound(result.clientRoundId);
        } else {
          await scheduleRetry(result.clientRoundId); // Exponential backoff + jitter
        }
      }
    });
  }
);`]
]);

// 3. P1 - MFA ADR
replaceInFile('docs/adr/0010-admin-mfa.md', [
    [/kiểm tra bảng `admin_step_up_grants`/g, `Sử dụng bảng riêng:
\`admin_step_up_grants\` (user_id, session_id, verified_at, expires_at, nonce, consumed_at).`],
    [/yêu cầu sinh một step-up grant \(`admin_step_up_grants`\) có hiệu lực tối đa 5 phút sau khi giải TOTP/g, `yêu cầu step-up grant <= 5 phút. Delete account dùng one-time grant, read/grant/reset dùng grant 5 phút.`],
    [/giảm thiểu đáng kể/g, `hạn chế`]
]);

// 4. P1 - Guest Upgrade ADR
replaceInFile('docs/adr/0009-guest-account-upgrade.md', [
    [/5\. \*\*completed\*\*: Trigger Postgres chỉ đánh dấu `email_verified`\. Quá trình promote thực sự dùng RPC `finalize_guest_upgrade_tx` \(khóa upgrade_operation -> xác minh `old_sessions_revoked`, `target_email`, `expired\/consumed` -> update `role = user` -> update operation = `completed` -> commit\)\.\n   Sau hoàn tất: Yêu cầu đăng nhập lại\. Từ chối các token được phát trước `upgraded_at`\./g, 
`Trigger email chỉ chuyển \`pending_verification -> email_verified\`.
5. **completed**: Quá trình promote thực sự dùng duy nhất RPC \`finalize_guest_upgrade_tx\` (chỉ chạy sau khi \`old_sessions_revoked\` -> khóa upgrade_operation -> xác minh \`target_email\` & \`expired/consumed\` -> update \`role = user\` -> update operation = \`completed\` -> lưu \`upgraded_at\` -> commit).
   Sau hoàn tất: Yêu cầu đăng nhập lại. Các endpoint nhạy cảm từ chối token có \`iat < upgraded_at\`.`]
]);

// 5. P1 - Account Deletion Journal
replaceInFile('docs/feature_admin.txt', [
    [/Mỗi bước đều Idempotent, có `attempt_count`, `last_error`, có thể retry, lưu audit và đảm bảo duy nhất một operation active trên mỗi user\. Trả về 202 Accepted cho API\./g, 
`Mỗi bước đều có cấu trúc: \`idempotency_key\`, \`target_user_id\`, \`state\`, \`attempt_count\`, \`last_error\`, \`created_at\`, \`updated_at\`, \`completed_at\`. 
API trả về 202 Accepted khi đang tiếp nhận (chưa hoàn tất). Cả Admin delete và Self-delete đều chung orchestration này, chỉ khác capability và audit actor.`]
]);

// 6. P1 - Anti-cheat Validation RT 80ms
replaceInFile('docs/feature_anticheat_observability.txt', [
    [/Zod Validation: Thời gian thực hiện báo cáo từ client \(`clientElapsedMs`\) phải được kiểm tra chặt chẽ bởi Zod Schema.*?không tự động clamp thành dữ liệu hợp lệ\./g, 
`Zod Validation: Zod chỉ kiểm tra finite, không âm và giới hạn trên (upper bound) hợp lý. Nó không chặn RT dưới 80ms (để dành cho Inspector).`],
    [/- Các mẫu rác \(`< HUMAN_FLOOR_MS`\) sẽ bị loại bỏ khỏi luồng tính `median` và `cv` để giảm false positive\./g, 
`- Các mẫu rác (\`< HUMAN_FLOOR_MS\`) sẽ bị Scorer loại bỏ khỏi luồng tính \`median\` và \`cv\`. Sau khi lọc phải còn đủ số mẫu tối thiểu. \n   - Mọi kết quả cuối đều đi qua \`assertFiniteScore\`.`],
    [/Từ chối targets = 0 hoặc nonTargets = 0/gi, `N-Back phải reject nếu targets === 0 hoặc nonTargets === 0.`]
]);
replaceInFile('docs/feature_games_scoring.txt', [
    [/Từ chối targets = 0 hoặc nonTargets = 0/gi, `N-Back phải reject nếu targets === 0 hoặc nonTargets === 0.`]
]);

// 7. P1 - Data retention mâu thuẫn
replaceInFile('docs/data-retention.md', [
    [/Khách \(Guest\) vô danh:.*?sau 30 ngày\./s, `Khách (Guest):\n- Guest chưa từng chơi: Xóa sau 30 ngày.\n- Guest đã chơi nhưng chưa nâng cấp: Cảnh báo, sau đó xóa sau 90-180 ngày không hoạt động.\n- User chính thức: Giữ tới khi tự xóa.\n- Raw telemetry: Giữ 90-180 ngày.\n- Aggregated history/score: Giữ tới khi xóa tài khoản.`],
    [/90 ngày \(đối với observability_events\)/g, `90 ngày (đối với observability_events)`],
    [/SELECT p\.id FROM public\.profiles p WHERE p\.role = 'guest'/g, 
`SELECT p.id FROM public.profiles p WHERE p.role = 'guest' AND coalesce(p.last_activity_at, p.created_at) < now() - interval '30 days'`]
]);

// 8. P2 - Lỗi lặp và văn bản cũ
replaceInFile('docs/feature_gamification_social.txt', [
    [/Vite\/React \/ React/g, `Vite/React`],
    [/- Hệ thống kết bạn/g, `Thêm invariant \`CHECK (user_id <> friend_id)\` và canonical unique pair để chặn đồng thời (A,B) và (B,A).\n- Hệ thống kết bạn`],
    [/syncAchievements\(\)/g, `Cập nhật achievement qua outbox/counter sau round, không syncAchievements() trên mỗi mount để tránh tốn DB scan.`]
]);
replaceInFile('docs/feature_admin.txt', [
    [/HTTP GET GET/g, `HTTP GET`],
    [/requireAdmin\(\), requireAdmin\(\)/g, `requireAdmin()`]
]);
replaceInFile('docs/adr/0001-fake-email-auth.md', [
    [/IndexedDB/g, `LocalStorage`]
]);
replaceInFile('docs/adr/0002-server-only-scoring.md', [
    [/tuyệt đối/g, `giảm thiểu tối đa`]
]);
replaceInFile('docs/adr/0005-strict-offline-sync.md', [
    [/chính xác tuyệt đối 100%/g, `chuẩn xác`]
]);
replaceInFile('docs/adr/0006-append-only-audit-log.md', [
    [/vĩnh viễn/g, `trong thời gian retention`]
]);
replaceInFile('docs/privacy-and-terms.md', [
    [/Supabase \(Backend\/DB\)/g, `Supabase (Backend/DB, Subprocessors liệt kê một lần duy nhất)`]
]);
replaceInFile('docs/known-issues.md', [
    [/\| runbook\.md \|\s*\| runbook\.md \|/g, `| runbook.md |`],
    [/KI-17 \| P3 \| Open/g, `KI-17 | P3 | Closed | Đã thêm Focus trap, aria-modal, prefers-reduced-motion và Playwright/axe test.`]
]);
replaceInFile('docs/feature_auth_profile.txt', [
    [/Không nên cho client trực tiếp update/g, `Dùng RPC change_username, không cho client trực tiếp update để chặn bypass reserved-names. Cập nhật avatar_url sau upload hợp lệ (check magic bytes, dimensions, strip EXIF, decode/re-encode). Turnstile check success, hostname, action, token age. Không log random guest password, Cache-Control: no-store.`]
]);
replaceInFile('docs/observability.md', [
    [/30 ngày/g, `90 ngày`],
    [/Cần external synthetic monitor/g, `Sử dụng external synthetic monitor. record_http_metric có load test/shard. Grafana kết nối read-only replica.`]
]);

console.log('Final fixes applied.');
