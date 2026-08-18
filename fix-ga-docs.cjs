const fs = require("fs");
const path = require("path");

const DOCS_DIR = "c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)/docs";

function replaceInFile(filename, replacements) {
    const filePath = path.join(DOCS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    let content = fs.readFileSync(filePath, "utf-8");
    let modified = false;

    for (const [search, replace] of replacements) {
        if (typeof search === 'string') {
            if (content.includes(search)) {
                content = content.replace(search, replace);
                modified = true;
            } else {
                console.error(`String not found in ${filename}: ${search.substring(0, 50)}...`);
            }
        } else { // RegExp
            if (search.test(content)) {
                content = content.replace(search, replace);
                modified = true;
            } else {
                console.error(`Regex not found in ${filename}: ${search}`);
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`Updated ${filename}`);
    }
}

// C2: Offline Idempotency & C4: PWA Compat in feature_offline_pwa.txt
replaceInFile("feature_offline_pwa.txt", [
    [
        `- \`MAX_OFFLINE_AGE_MS\`: \`7 * 24 * 3600_000\` (7 ngày) - Tuổi thọ tối đa của ván offline được server chấp nhận.`,
        `- \`MAX_OFFLINE_AGE_MS\`: Bỏ kiểm tra theo ngày (PWA có thể kẹt Service Worker hàng tháng). Server bắt buộc kiểm tra \`clientBuild\` và \`telemetrySchemaVersion\`. Hỗ trợ 2 \`telemetrySchemaVersion\` gần nhất, nếu quá cũ trả lỗi 426.`
    ],
    [
        `- Kiểm tra thời gian khởi tạo ván \`startedAt\`: Từ chối nếu \`startedAt\` lớn hơn thời gian hiện tại > 60s hoặc cũ hơn 7 ngày (\`MAX_OFFLINE_AGE_MS\`).`,
        `- Kiểm tra Version (\`telemetrySchemaVersion\`): Server từ chối xử lý và trả về 426 Upgrade Required nếu version gửi lên cũ hơn 2 bản so với version hiện tại.`
    ],
    [
        `- Kiểm tra Idempotency: Tra cứu DB \`round_tickets\` xem đã có ticket nào chứa \`client_round_id\` này và đã \`submitted_at\` chưa. Nếu rồi -> Trả về status \`"duplicate"\`.`,
        `- Kiểm tra Idempotency: Xoá sự phụ thuộc vào \`submitted_at\`. Sử dụng duy nhất DB Constraint (\`CREATE UNIQUE INDEX round_tickets_client_round_uid\`) và kiểm tra \`state IN ('accepted','rejected','invalid','failed')\` làm source of truth. Nếu đã tồn tại -> Trả về status \`"duplicate"\` và không xử lý lại.`
    ]
]);

// C2 & M10: CI.md updates
replaceInFile("ci.md", [
    [
        `2. LUỒNG KIỂM THỬ TỰ ĐỘNG (AUTOMATED TESTING)`,
        `2. LUỒNG KIỂM THỬ TỰ ĐỘNG (AUTOMATED TESTING)\n\n  * \`test:offline-idempotency\`: Gửi lại cùng một offline sync batch 3 lần, assert số row practice_sessions và cheat_flags không thay đổi.`
    ],
    [
        `Khởi chạy workflow \`db:migrate:smoke\` trên mọi PR.`,
        `Khởi chạy workflow \`db:migrate:smoke\` trên nhánh main. Bắt buộc cấu hình GitHub Environment Protection Rules (yêu cầu phê duyệt từ reviewer) trước khi deploy production. Phải dùng bảng duy nhất theo dõi: nhánh -> environment -> deploy gì -> approval.`
    ]
]);

// C3: Storage Matrix in feature_auth_profile.txt & feature_ui_dashboard.txt
const storageMatrixStr = `
CƠ CHẾ LƯU TRỮ (STORAGE MATRIX):
- [brand]-ui-theme -> localStorage (Phải đọc sync trước khi paint để tránh FOUC)
- sb-* (session) -> localStorage (Do Supabase Auth quản lý nguyên bản)
- [brand].cached_profile -> localStorage (Payload nhỏ, cần đọc sync khi boot)
Cấm gọi trực tiếp \`localStorage/indexedDB\` ngoài folder \`lib/storage/\` (cần enforcing bằng ESLint rule).
`;
replaceInFile("feature_auth_profile.txt", [
    [
        `Client: Hiển thị trạng thái tiến trình xóa. Khi xong, getSupabase().auth.signOut() + Xóa key 'sb-*' trong IndexedDB.`,
        `Client: Hiển thị trạng thái tiến trình xóa. Khi xong, \`signOut(userId, 'global')\` (để huỷ toàn bộ refresh token, đề phòng bị chiếm tài khoản) + Xóa key 'sb-*' trong localStorage.`
    ],
    [
        `2. Bảo vệ thông tin cá nhân (PII Privacy):`,
        storageMatrixStr + `\n2. Bảo vệ thông tin cá nhân (PII Privacy):`
    ],
    [
        `Ghi cache IndexedDB ('neurobics.cached_profile')`,
        `Ghi cache localStorage ('neurobics.cached_profile')`
    ]
]);
// C3 for dashboard
replaceInFile("feature_ui_dashboard.txt", [
    [
        `ThemeProvider lưu IndexedDB`,
        `ThemeProvider lưu localStorage`
    ]
]);

// M1, M2: feature_games_scoring.txt changes
replaceInFile("feature_games_scoring.txt", [
    [
        `*Công thức tính Rating (EMA)*:\n- Nếu điểm mới \`> peak\`: \`peak = peak + (score - peak) * 0.4\`.\n- Nếu điểm mới \`< peak\`: \`peak = peak + (score - peak) * 0.28\`.`,
        `*Công thức tính Rating (EMA đối xứng - Fix M1)*:\n- \`peak = peak + (score - peak) * 0.3\`. Chỉ snap (làm tròn/cố định) khi \`|score - peak| <= RATING_SNAP\`. Bỏ bước snap bắt buộc ±3.`
    ],
    [
        `+ **Nội suy (Interpolation)**: \`compute_cognitive_index()\` tính trung bình cộng 5 trục \`effective_rating\`. Những trục chưa từng chơi (score = 0) sẽ được nội suy (phạt 30%) dựa trên trung bình các trục đã mở.`,
        `+ **Nội suy (Interpolation - Fix M2)**: \`compute_cognitive_index()\` = tính trung bình cộng các trục **ĐÃ CHƠI** * \`coverage_multiplier\`. Hiển thị riêng \`confidence_score\` (dựa trên số lượng trục đã mở và số mẫu), tuyệt đối không phạt người chơi vào điểm số làm tụt Index so với việc không chơi.`
    ]
]);

// M3, M4, M5: feature_anticheat_observability.txt & monitoring-alerts.md
replaceInFile("feature_anticheat_observability.txt", [
    [
        `12. \`search\` (Tìm kiếm đối tượng):`,
        `Cross-check totalTaps với rts.length và clearedLevels; lệch -> soft flag, không hard.
Hard reject chỉ khi có >= 2 tín hiệu độc lập.
Shadow mode: Bật shadow mode 2 tuần cho mọi luật hard mới: ghi flag nhưng vẫn accept, đo FP thật, rồi mới enforce.

12. \`search\` (Tìm kiếm đối tượng):`
    ]
]);

replaceInFile("monitoring-alerts.md", [
    [
        `1. Mức độ Nghiêm trọng (Severity Levels)`,
        `1. Mức độ Nghiêm trọng (Severity Levels)\n- **Dead-man Switch**: Nếu không nhận được tín hiệu từ \`pg_cron\` hoặc \`alert_engine\` trong 15 phút -> Bắn P1 Critical Alert. (Hệ thống im lặng tuyệt đối = Outage).`
    ],
    [
        `Tỉ lệ Submit Round Error 5xx > 5%.`,
        `Tỉ lệ Submit Round Error 5xx có Burn-rate vi phạm (fast 5m & 1h @ 14.4x, slow 6h & 3d @ 6x) với điều kiện \`requests >= 50\`.`
    ],
    [
        `Số lượng Hard Reject vọt lên bất thường (>50 flags/giờ).`,
        `Tỉ lệ Hard Reject vượt % quy định so với baseline của tuần trước.`
    ],
    [
        `Hàng đợi Offline Queue > 150 (cảnh báo).`,
        `(Đã gỡ bỏ: Hàng đợi offline > 150 là metric client, server không có cách nào biết được).`
    ],
    [
        `[P1] Phản hồi trong 5 phút`,
        `[P1] Phản hồi trong 5 phút (Áp dụng paging thật ngoài giờ hành chính)`
    ]
]);

// M6: runbook.md
replaceInFile("runbook.md", [
    [
        `1. Thay đổi trạng thái game thành \`disabled\` hoặc \`internal\` trong cơ sở dữ liệu:
   - Truy cập bảng \`feature_flags\` trên Supabase (hoặc chạy SQL Update).
   \`\`\`sql
   UPDATE feature_flags SET status = 'disabled' WHERE feature = 'game:schulte';
   \`\`\`
1. Gọi Edge Function hoặc Webhook để **Invalidate Cache** các feature flags, đảm bảo Edge Function áp dụng thay đổi ngay lập tức mà không cần chờ TTL.`,
        `1. Thay đổi trạng thái game thành \`disabled\` hoặc \`internal\`:
   - GỌI API: \`POST /server/admin-feature-flags\` với capability flags tương ứng.
   - Server sẽ xử lý transaction ghi audit log + invalidate cache lập tức. (KHÔNG ĐƯỢC CHẠY SQL UPDATE TAY - Vi phạm Admin Contract).`
    ],
    [
        `1. Xóa migration lỗi (nếu chưa push lên production) và tạo lại.
1. Nếu migration đã kẹt trên production (ví dụ: tạo index mất nhiều giờ), có thể phải chạy \`pg_cancel_backend\` để ngắt câu lệnh đang chạy.`,
        `1. Xóa migration lỗi (nếu chưa push lên production) và tạo lại.
1. Khắc phục sự cố kẹt Migration: (a) Luôn dùng \`lock_timeout\` (vd: '2s') cho DDL để tránh downtime. (b) Khi cancel CREATE INDEX, nhớ có bước dọn invalid index. (c) Với Index lớn, phải dùng CREATE INDEX CONCURRENTLY ở file migration riêng ngoài transaction. (d) Bảng log nên dùng DROP PARTITION thay cho DELETE.`
    ]
]);

// Fix Observability Name (M8) & p95 Math (M9)
replaceInFile("feature_anticheat_observability.txt", [
    [
        `chứa \`durationMs\` và HTTP status code`,
        `chứa \`duration_ms\` (chuẩn hoá snake_case) và HTTP status_code`
    ]
]);

console.log("Docs migration script completed.");
