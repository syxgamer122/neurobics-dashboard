const fs = require('fs');

function replaceLiteral(filePath, searchStr, replaceStr) {
    if (!fs.existsSync(filePath)) {
        console.log("Not found: " + filePath);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Replaced in: " + filePath);
    } else {
        console.log("String not found in: " + filePath);
    }
}

// 1. version-policy.md
let oldVersionStr = `Round được score bằng version hiện tại lúc server xử lý.
- Có thể tái chấm điểm (re-score) một round cũ bằng phiên bản mới nếu phát hiện lỗi công thức trong quá khứ.
- Lịch sử chấm điểm được version hoá rõ ràng để đảm bảo tính toàn vẹn.`;
let newVersionStr = `Lưu đầy đủ version trên \`round_tickets\` khi start-round (\`scorer_version\`, \`inspector_version\`, \`shared_inspector_version\`, \`telemetry_schema_version\`, \`config_version\`). Khi submit, dùng chính các version này từ ticket để chấm điểm. Giữ implementation cũ ít nhất bằng TTL ticket.
- Có thể tái chấm điểm (re-score) một round cũ bằng phiên bản mới nếu phát hiện lỗi công thức trong quá khứ.
- Lịch sử chấm điểm được version hoá rõ ràng để đảm bảo tính toàn vẹn.`;
replaceLiteral('docs/version-policy.md', oldVersionStr, newVersionStr);

// 2. data-retention.md (Fix the mess)
let oldRetentionStr = `- **Định nghĩa "Bỏ hoang"**:
  - \`role = 'guest'\`
  - Không có hoạt động nào trong 90 ngày (đối với observability_events) qua (\`coalesce(last_activity_at, created_at) < now() - interval '30 days'\`).
  - Không có bất kỳ bản ghi nào trong bảng \`training_sessions\`.
  - Không có bất kỳ bản ghi nào trong bảng \`practice_sessions\`.
- **Thời gian lưu trữ**: Xóa ngay khi đạt chuẩn Bỏ hoang (30 ngày).
- **Xử lý**: 
  - Gọi API xóa Supabase Auth User (Server tự xóa user ảo).
  - DB Trigger/Cascade tự động dọn dẹp Row tương ứng bên \`public.profiles\`.`;
let newRetentionStr = `- **Định nghĩa Retention**:
  - **Guest chưa chơi**: Xóa sau 30 ngày.
  - **Guest đã chơi nhưng chưa nâng cấp**: Cảnh báo, sau đó xóa sau 90-180 ngày không hoạt động.
  - **User chính thức**: Giữ tới khi tự xóa.
  - **Raw cognitive telemetry**: Giữ 90-180 ngày.
  - **Aggregated history/score**: Giữ tới khi xóa tài khoản.
  - **Observability**: 90 ngày.
  - **Cheat flags**: 90 ngày.
  - **Admin audit**: 365 ngày.
  - **Completed outbox/journal**: 7-30 ngày.`;
replaceLiteral('docs/data-retention.md', oldRetentionStr, newRetentionStr);

// 3. data-retention SQL
let oldSql = `SELECT p.id FROM public.profiles p WHERE p.role = 'guest' AND coalesce(p.last_activity_at, p.created_at) < now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1
    FROM public.training_sessions ts
    WHERE ts.user_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.practice_sessions ps
    WHERE ps.user_id = p.id
  );`;
let newSql = `SELECT p.id
FROM public.profiles p
WHERE p.role = 'guest'
  AND coalesce(p.last_activity_at, p.created_at) < now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1
    FROM public.legal_holds h
    WHERE h.subject_user_id = p.id
      AND h.released_at IS NULL
  );`;
replaceLiteral('docs/data-retention.md', oldSql, newSql);

// 4. feature_games_scoring math bounds
replaceLiteral('docs/feature_games_scoring.txt', 'clamp01(clamp01(1 - lapseRate * 1.15))', 'clamp01(1 - lapseRate * 1.15)');
replaceLiteral('docs/feature_games_scoring.txt', 'clamp01(accuracy) ^ 1.15', 'Math.pow(clamp01(accuracy), 1.15)');

// Math bounds in feature_games_scoring.txt
let oldNBack = `if (targets === 0 || nonTargets === 0) {
      throw new Error("Invalid trial count");
    }`;
let newNBack = `if (targets <= 0 || nonTargets <= 0) {
      throw new ValidationError("Invalid N-Back trial distribution");
    }`;
replaceLiteral('docs/feature_games_scoring.txt', oldNBack, newNBack);

let oldMental = `const angleLoad = Math.abs(Math.sin(angleDegrees / 2));`;
let newMental = `const radians = angleDegrees * Math.PI / 180;
const angleLoad = Math.abs(Math.sin(radians / 2));`;
replaceLiteral('docs/feature_games_scoring.txt', oldMental, newMental);

// 5. feature_admin.txt deletions
let adminOld = `Tiến trình xóa sử dụng Operation Journal (bảng \`account_deletion_operations\`):
- \`requested\`
- \`storage_deleted\`
- \`auth_deleted\`
- \`database_cleaned\`
- \`completed\`
Mỗi bước đều Idempotent, có \`attempt_count\`, \`last_error\`, có thể retry, lưu audit và đảm bảo duy nhất một operation active trên mỗi user. Trả về 202 Accepted cho API.`;

let adminNew = `Tiến trình xóa sử dụng Operation Journal chung (orchestration) cho cả Self-delete và Admin-delete qua bảng \`account_deletion_operations\`:
- \`requested\`
- \`storage_deleted\`
- \`auth_deleted\`
- \`database_cleaned\`
- \`completed\`

Mỗi operation cần: \`idempotency_key\`, \`target_user_id\`, \`actor_user_id\`, \`state\`, \`attempt_count\`, \`next_retry_at\`, \`last_error\`, \`completed_at\`.
API trả 202 Accepted trong lúc xử lý. UI hiển thị trạng thái đang xóa. Self-delete phải yêu cầu recent reauthentication.`;
replaceLiteral('docs/feature_admin.txt', adminOld, adminNew);
replaceLiteral('docs/feature_auth_profile.txt', adminOld, adminNew);

// 6. Runbook false positive
let runbookOld1 = `append \`manual_review(false_positive)\` -> append compensation -> khôi phục capability -> BẮT BUỘC giữ nguyên \`cheat_flags\`.`;
let runbookNew1 = `append \`manual_review(false_positive)\` -> append compensation/correction -> phục hồi capability -> giữ nguyên \`cheat_flags\`.`;
replaceLiteral('docs/runbook.md', runbookOld1, runbookNew1);

let runbookOld2 = `Không được giảm version. Rollback bằng cách lấy logic cũ lưu vào version lớn hơn.`;
let runbookNew2 = `Không giảm version. (v3 = logic lỗi, v4 = triển khai logic tương đương v2).`;
replaceLiteral('docs/runbook.md', runbookOld2, runbookNew2);

let runbookOld3 = `phải redeploy bộ frontend-server-schema tương thích hoặc roll-forward.`;
let runbookNew3 = `xác định frontend/server/schema compatibility -> disable feature nếu cần -> deploy bộ tương thích -> roll-forward migration. Không tự động revert frontend nếu backend/schema đã thay đổi không tương thích.`;
replaceLiteral('docs/runbook.md', runbookOld3, runbookNew3);

// 7. Visual search anticheat
replaceLiteral('docs/feature_anticheat_observability.txt', 
    `Dùng raw fields (targetsFound, responses, misses) để đánh giá. Không phụ thuộc điểm số do client tính.`,
    `Định nghĩa invariant raw: targetsFound <= totalTargets; misses <= totalTargets; responses.length == expectedTrials; targetsFound + misses == expectedTargets. Không nhận hoặc kiểm tra điểm do client tự tính.`);

// 8. Brain age
let brainAgeOld = `5 round: trạng thái "đang hiệu chuẩn". Yêu cầu 20-30 online rounds với độ phủ ít nhất 4/5 trục. Hiển thị confidence score. Bắt buộc không dùng wording mang tính chẩn đoán y tế.`;
let brainAgeNew = `Năm round chỉ nên là onboarding:
- 5 round: “đang hiệu chuẩn”.
- 20–30 online authoritative rounds.
- Phủ ít nhất 4/5 trục.
- Hiển thị confidence score.
- Không dùng wording mang tính chẩn đoán.`;
replaceLiteral('docs/feature_games_scoring.txt', brainAgeOld, brainAgeNew);

// 9. CI md
let ciOld = `### 1.3 System Integration & Security Tests (Bắt buộc)
Các test này kiểm tra sâu vào cấu trúc và sự nguyên tử của hệ thống:
- \`test:round-concurrency\`: Gửi 100 request đồng thời cùng 1 ticket, đảm bảo chỉ có 1 outcome duy nhất. Đảm bảo Edge Function sập giữa chừng vẫn reclaim được vé an toàn.
- \`test:offline-isolation\`: Bắn 1.000 ván offline practice, xác thực tuyệt đối competitive state (rating, PB, level, achievement) bất biến.
- \`test:guest-upgrade\`: Xác thực Guest upgrade không promote trước khi revoke session cũ.
- \`test:admin-step-up\`: Từ chối JWT Admin hợp lệ nhưng không có recent TOTP grant.
- \`test:account-deletion-resume\`: Gây lỗi giữa chừng trong lúc xóa Auth/Storage, xác thực Operation Journal có thể resume và clean up thành công.
- \`test:rls-negative\`: Tấn công thử RLS bằng nhiều role khác nhau, đảm bảo dữ liệu chéo không rò rỉ.
- \`test:migration-upgrade-snapshot\`: Chạy SQL Migration trực tiếp trên bản sao Production Snapshot thay vì clean DB để phát hiện xung đột dữ liệu.
- \`test:scoring-fuzz\`: Fuzzing toàn bộ Scorer, đảm bảo đầu ra luôn nằm trong [0, 1000] và là số thực hữu hạn (tuyệt đối không sinh NaN/Infinity).
- \`test:a11y\`: Playwright/axe test đảm bảo tiêu chuẩn Focus Trap, Aria, Reduced Motion.`;
let ciNew = `### 1.3 System Integration & Security Tests (Bắt buộc required checks trên nhánh main)
Các test này phải nằm trong Branch Protection Rules, không được phép continue-on-error. Kết quả pass/fail, commit SHA, artifact checksums phải được lưu lại.
- \`test:round-concurrency\`: Gửi 100 request đồng thời cùng 1 ticket.
- \`test:offline-isolation\`: Bắn 1.000 ván offline practice.
- \`test:guest-upgrade\`: Guest upgrade không promote trước khi revoke.
- \`test:admin-step-up\`: JWT hợp lệ nhưng không có recent TOTP sẽ bị từ chối.
- \`test:account-deletion-resume\`: Deletion fail giữa bước Auth và DB có thể resume.
- \`test:rls-negative\`: Negative testing các table.
- \`test:migration-upgrade-snapshot\`: Migration chạy từ clean DB và production snapshot.
- \`test:scoring-fuzz\`: Fuzz mọi scorer [0,1000], finite.
- \`test:a11y\`: Bắt buộc.`;
replaceLiteral('docs/ci.md', ciOld, ciNew);

console.log("Done literal replacements");
