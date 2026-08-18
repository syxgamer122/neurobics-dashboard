const fs = require('fs');
let content = fs.readFileSync('docs/feature_offline_pwa.txt', 'utf8');

content = content.replace(/\[L.*?p t.*?ng vA.*?n offline\]:[\s\S]*?\[Server tr.*? v.*? JSON/, 
`[Lớp tầng ván offline]:                                                                    [Xử lý lỗi Batch]:
 1. Kiểm tra age <= 7 ngày & format hợp lệ.                                                 Nếu lỗi Server 500:
  2. Call RPC submit_offline_practice_tx() (chỉ Insert practice_sessions, cập nhật last_activity_at, cấp practice_xp/streak). KHÔNG update rating, total_xp, PB hay mở achievement cạnh tranh. (Xử lý idempotency bằng ON CONFLICT DO NOTHING).
 3. Thành công -> status: "ok" hoặc "duplicate".

[Server trả về JSON`);

content = content.replace(/1\. HA.*?ng.*?\`offline-queue\.ts\`\):[\s\S]*?2\. T.*?.*?\`use-offline-sync\.ts\`\):/, 
`1. Hàng đợi Offline & Quản lý Bộ nhớ (offline-queue.ts):
   - Khi ghi ván mới (pushOfflineRound):
     \`\`\`typescript
     if (await countPendingRounds(userId) >= MAX_QUEUE) {
       throw new QueueFullError();
     }

     await db.put("offlineRounds", {
       ...round,
       clientRoundId: crypto.randomUUID(),
       userId,
       status: "pending",
       attemptCount: 0,
       nextRetryAt: null,
       createdAt: new Date().toISOString(),
     });
     // Object store schema: clientRoundId (PK), userId, status, attemptCount, nextRetryAt, createdAt, payload
     \`\`\`
   - Chống Race Condition khi đồng bộ (syncOfflineQueue):
     Sử dụng Web Lock thực sự để ngăn nhiều tab cùng sync:
     \`\`\`typescript
     await navigator.locks.request(
       \`offline-sync:\${userId}\`,
       { ifAvailable: true },
       async (lock) => {
         if (!lock) return;
         await syncPendingRounds(userId);
       }
     );
     \`\`\`

2. Tự động Đồng bộ (use-offline-sync.ts):`);

fs.writeFileSync('docs/feature_offline_pwa.txt', content, 'utf8');
