const fs = require('fs');
const path = require('path');

const docsDir = path.join('c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)', 'docs');

function updateFile(filename, replacements) {
  const filepath = path.join(docsDir, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filename}`);
    return;
  }
  let content = fs.readFileSync(filepath, 'utf8');
  let changed = false;
  for (const r of replacements) {
    if (content.includes(r.search)) {
      content = content.replace(r.search, r.replace);
      changed = true;
    } else {
      console.warn(`[${filename}] Could not find: ${r.search.substring(0, 40)}...`);
    }
  }
  if (changed) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Updated ${filename}`);
  }
}

// -------------------------------------------------------------------------------------------------
// P0 FIXES
// -------------------------------------------------------------------------------------------------

// P0-1: Age Threshold Inconsistency
updateFile('privacy-and-terms.md', [
  {
    search: 'MindGem requires users to be at least 16 years old globally.',
    replace: 'MindGem requires users to be at least 16 years old globally. (Hệ thống kiểm tra: UI/Zod validate `birth_year <= currentYear - 16`, DB trigger chặn `< 16`). Các tài khoản hiện tại có `birth_year > currentYear - 16` sẽ được migration đánh dấu `restricted` để review thay vì xoá.'
  }
]);

updateFile('ci.md', [
  {
    search: '- `test:a11y`: Bắt buộc.',
    replace: '- `test:a11y`: Bắt buộc.\n- `test:age-gate`: Bắt buộc. Chạy assert cả 3 tầng (UI, API, DB) đều từ chối age < 16 đồng nhất.'
  }
]);

// P0-2: Rate Limit Bypass via x-forwarded-for
updateFile('feature_anticheat_observability.txt', [
  {
    search: 'Lấy `clientIp()` từ mảng IP đầy đủ. Nếu IP là unknown hoặc untrusted, bắt buộc yêu cầu Turnstile payload hợp lệ.',
    replace: 'Sử dụng thuật toán Rightmost-Untrusted để lấy IP thực. `const idx = Math.max(0, chain.length - 1 - (TRUSTED_PROXY_HOPS - 1)); return chain[idx];`. Bắt buộc log chuỗi XFF trên staging 24h để chốt `TRUSTED_PROXY_HOPS`. Thêm test gửi header XFF giả để đảm bảo tính năng Rate Limit hoạt động đúng. Bổ sung Rate limit và Turnstile cho cả luồng Login để chặn credential stuffing.'
  }
]);

// P0-3: Dead-man Switch Design Flaw
updateFile('monitoring-alerts.md', [
  {
    search: '| **P0 (Outage)** | **Dead-man Switch**: Không nhận được heartbeat từ `pg_cron` hoặc `alert_engine` trong 15 phút. | Hệ thống im lặng tuyệt đối = Database treo. Gọi On-call lập tức (paging). |',
    replace: '| **P0 (Outage)** | **Dead-man Switch (External Ping)**: `pg_cron` gọi webhook push (healthchecks.io) mỗi 5 phút. Nếu healthchecks.io không nhận được tín hiệu quá 15 phút -> Bắn Paging Alert (điện thoại). Ngoài ra cung cấp GET `/server/health` trả về `{ db: ok, last_cron_run: ts }` không yêu cầu auth để uptime monitor bên ngoài ping mỗi 60s. Alert nội bộ Postgres dùng mô hình outbox + retry thay vì pg_net trực tiếp. |'
  }
]);

// P0-4: PWA Offline TTL Inconsistency
updateFile('feature_offline_pwa.txt', [
  {
    search: '- `MAX_OFFLINE_AGE_MS`: Bỏ kiểm tra theo ngày (PWA có thể kẹt Service Worker hàng tháng). Server bắt buộc kiểm tra `clientBuild` và `telemetrySchemaVersion`. Hỗ trợ 2 `telemetrySchemaVersion` gần nhất, nếu quá cũ trả lỗi 426.',
    replace: '- `MAX_OFFLINE_AGE_MS`: Cập nhật logic: Nếu ván cũ hơn 7 ngày, hệ thống VẪN NHẬN để lưu lịch sử, nhưng gắn cờ `provenance = \'offline_stale\'`, cho `XP = 0`. KHÔNG REJECT để tránh mất ván của người chơi. Compat window để xoá code dựa hoàn toàn vào việc version gửi lên có cũ hơn 2 bản so với `telemetrySchemaVersion` hay không (quá cũ -> 426).'
  }
]);

// P0-5: Admin MFA Lockout Risk
updateFile('feature_admin.txt', [
  {
    search: '6. Role-Based Access Control (RBAC):',
    replace: '5b. Admin MFA Lockout Protection:\n   - CI Deploy Check: Chặn deploy nếu phát hiện Admin chưa enroll TOTP (`aal != aal2`).\n   - Dashboard cung cấp `/settings/security` cho Admin enroll TOTP + Recovery Codes.\n   - Break-glass Procedure: Chuẩn bị sẵn script vô hiệu hoá MFA tạm thời bằng service_role và Two-person rule trong runbook để cứu hộ khi Admin mất quyền kiểm soát.\n\n6. Role-Based Access Control (RBAC):'
  }
]);

// -------------------------------------------------------------------------------------------------
// P1 FIXES
// -------------------------------------------------------------------------------------------------

// P1-6: Achievement Thresholds Impossible
updateFile('feature_games_scoring.txt', [
  {
    search: '*Ghi chú Cân bằng (Calibration)*: Mỗi trục điểm được căn chỉnh (calibrate) sao cho P50 của dân số toàn cầu tương đương mốc 500 điểm. Tránh dùng hệ số Focus < 1 quá nhiều khiến điểm bị nén (compression) quanh mốc thấp. Percentile thật sự phải được nội suy từ histogram phân phối, không dùng hàm lỗi Erf xấp xỉ.',
    replace: '*Ghi chú Cân bằng (Calibration)*: Mỗi trục điểm được căn chỉnh sao cho P50 = 500 điểm và mức hoàn hảo (perfect play) phải đạt tiệm cận TRẦN 1000 điểm. Cấm sử dụng các công thức hạ trần (như Stroop focus max 717) làm độ khó; độ khó phải thể hiện qua độ dốc của điểm. Yêu cầu có `test:scoring-ceiling` tính toán trần của mọi game và assert đạt mốc thành tựu (990+). Tạm thời hạ mốc thành tựu xuống mức khả thi cho đến khi normalize xong.'
  }
]);

// P1-7: Asymmetric EMA Inflation
updateFile('feature_games_scoring.txt', [
  {
    search: '*Công thức tính Rating (EMA đối xứng - Fix M1)*:\n- `peak = peak + (score - peak) * 0.3`. Chỉ snap (làm tròn/cố định) khi `|score - peak| <= RATING_SNAP`. Bỏ bước snap bắt buộc ±3.',
    replace: '*Công thức tính Rating (Robust Trimmed Mean)*:\n- Áp dụng Trimmed Mean trên 10 ván gần nhất (loại bỏ 20% cao nhất/thấp nhất) để tính rating ổn định, không phụ thuộc vào ván cuối cùng và không gây lạm phát EMA. Giữ giá trị `best_score` riêng biệt để hiển thị thành tích.'
  }
]);

// P1-8: Coverage Multiplier Penalizes Play
updateFile('feature_games_scoring.txt', [
  {
    search: '+ **Nội suy (Interpolation - Fix M2)**: `compute_cognitive_index()` = tính trung bình cộng các trục **ĐÃ CHƠI** * `coverage_multiplier`. Hiển thị riêng `confidence_score` (dựa trên số lượng trục đã mở và số mẫu), tuyệt đối không phạt người chơi vào điểm số làm tụt Index so với việc không chơi.',
    replace: '+ **Nội suy (Interpolation - Fix M2)**: `compute_cognitive_index()` = Tính trung bình cộng của các trục **ĐÃ CHƠI**. Tuyệt đối BỎ `coverage_multiplier` (nhân hệ số này sẽ làm giảm Index khi mở trục mới, trái với nguyên tắc không phạt người chơi). `confidence_score` là giá trị độc lập dùng để hiển thị mức độ tin cậy.'
  }
]);

// P1-9: Offline Provisional Score Bleeds into State
updateFile('feature_offline_pwa.txt', [
  {
    search: '└──► 2. estimateRoundResult() ──► Tính điểm & XP tạm thời bằng Client Scorer\n                                           │\n                                           ▼\n                                     Cập nhật Profile UI & Hiển thị Result Overlay',
    replace: '└──► 2. estimateRoundResult() ──► Tính điểm & XP tạm thời bằng Client Scorer\n                                           │\n                                           ▼\n                                     Lưu vào state riêng (provisionalRounds[]), KHÔNG merge vào cachedProfile. Hiển thị UI với badge PRACTICE.'
  }
]);

// P1-10 & P1-11: Admin Reset Erases Audit & Cascade Delete
updateFile('feature_admin.txt', [
  {
    search: '-- KHÔNG xóa xp_events (ngoại trừ game = \'achievement\' để tránh double XP) (giữ audit trail)',
    replace: '-- TUYỆT ĐỐI KHÔNG DELETE TRONG xp_events. Ghi đè bằng cách thay đổi stats_generation. Tránh phá vỡ invariant ledger.'
  }
]);
updateFile('feature_auth_profile.txt', [
  {
    search: '├─► Server xử lý state machine: `storage_deleted` -> `auth_deleted` -> `database_cleaned` -> `completed`',
    replace: '├─► Server xử lý state machine: `storage_deleted` -> `auth_deleted` -> `database_cleaned` -> `completed`\n  ├─► *Lưu ý Erasure*: Bỏ FK cascade trên `cheat_flags` và `admin_audit`. Pseudonymize bằng cách dùng `subject_hash = HMAC(user_id, secret)` và `UPDATE user_id = NULL WHERE user_id = $1` để giữ log 90/365 ngày hợp pháp.'
  }
]);

// P1-12: Explicit Consent Missing Mechanism
updateFile('privacy-and-terms.md', [
  {
    search: 'We process Cognitive Data (Brain Age / Index) based on your **Explicit Consent**, which you may withdraw at any time.',
    replace: 'We process Cognitive Data (Brain Age / Index) based on your **Explicit Consent**, which you may withdraw at any time. Hệ thống cung cấp bảng `user_consents` và UI Toggle trong Settings. Nếu rút consent, Brain Age sẽ bị ẩn nhưng game vẫn hoạt động. Tính năng Export Data cung cấp đầy đủ thông tin kể cả `practice_sessions` và `cheat_flags`.'
  }
]);

// -------------------------------------------------------------------------------------------------
// P2 & Nits FIXES
// -------------------------------------------------------------------------------------------------

// P2-2: Ticket Active Count Unique Constraint
updateFile('feature_games_scoring.txt', [
  {
    search: '- Hỗ trợ tối đa 3 vé (ticket) chưa nộp (active) cùng lúc (được phân biệt bằng `client_session_id`). Vé cũ thứ 4 mới bị đóng.',
    replace: '- Hỗ trợ tối đa 3 vé (ticket) chưa nộp (active) cùng lúc (phân biệt bằng `client_session_id`), chặn spam bằng `UNIQUE(user_id, game, state=\'issued\')` để tránh ticket shopping. Vé cũ thứ 4 mới bị đóng.'
  }
]);

// P2-3: Idempotency submitted_at
updateFile('feature_offline_pwa.txt', [
  {
    search: 'Kiểm tra Idempotency: Xoá sự phụ thuộc vào `submitted_at`. Sử dụng duy nhất DB Constraint (`CREATE UNIQUE INDEX round_tickets_client_round_uid`) và kiểm tra `state IN (\'accepted\',\'rejected\',\'invalid\',\'failed\')` làm source of truth. Nếu đã tồn tại -> Trả về status `"duplicate"` và không xử lý lại.',
    replace: 'Kiểm tra Idempotency: HOÀN TOÀN KHÔNG SỬ DỤNG CỘT `submitted_at`. Sử dụng duy nhất DB Constraint (`CREATE UNIQUE INDEX round_tickets_client_round_uid`) và kiểm tra `state IN (\'accepted\',\'rejected\',\'invalid\',\'failed\')` làm source of truth. Nếu đã tồn tại -> Trả về status `"duplicate"` và không xử lý lại.'
  }
]);
updateFile('feature_games_scoring.txt', [
  {
    search: 'Đánh dấu ticket `submitted_at = now()`.',
    replace: 'Cập nhật trạng thái ticket `state = \'accepted\'`.'
  }
]);

// P2-4 & P2-5: Reject Rate Source & Availability
updateFile('monitoring-alerts.md', [
  {
    search: 'SELECT successes * 100.0 / NULLIF(eligible, 0) AS success_rate_pct',
    replace: 'SELECT successes * 100.0 / NULLIF(eligible, 0) AS success_rate_pct;\n-- Bổ sung SLI 2: round_acceptance_rate = accepted/(accepted+rejected+5xx)'
  }
]);

// P2-6: Dashboard DB Connect
updateFile('operations-dashboard.md', [
  {
    search: 'Các truy vấn SQL để cấu hình Grafana/Datadog hoặc xem trực tiếp trên Supabase Log Explorer.',
    replace: 'Các truy vấn SQL để cấu hình Grafana/Datadog (Sử dụng Role `grafana_ro` chỉ có quyền SELECT trên `http_metrics_minute` và views, KHÔNG kết nối bằng superuser) hoặc xem trực tiếp trên Supabase Log Explorer.'
  }
]);

// P2-9: Offline XP & Quests
updateFile('feature_games_scoring.txt', [
  {
    search: '+ Thêm dòng vào `training_sessions` & `xp_events`.',
    replace: '+ Thêm dòng vào `training_sessions` & `xp_events`.\n     + LƯU Ý: Tạo view `engagement_sessions` (UNION của training và practice có ranked flag). Quest/streak đọc từ `engagement_sessions`, còn Leaderboard/Rating/Brain Age chỉ đọc `training_sessions`.'
  }
]);

// P2-10: Guest 180-day Deletion
updateFile('data-retention.md', [
  {
    search: '- **Cron B (Đã chơi & Quên lãng 180 ngày)**: Bắt buộc gửi cảnh báo trước khi xóa. `SELECT p.id FROM public.profiles p WHERE p.role = \'guest\' AND p.warned_at IS NOT NULL AND p.warned_at < now() - interval \'30 days\' AND NOT EXISTS (SELECT 1 FROM public.legal_holds h WHERE h.subject_user_id = p.id AND h.released_at IS NULL);`',
    replace: '- **Cron B (Đã chơi)**: Đối với Guest, xoá ngay sau 30 ngày inactive vì không có kênh liên lạc (email) để gửi cảnh báo, trừ khi guest đã tạo `recovery_code_generated` thì giữ 180 ngày.'
  }
]);

// Nit: cv() returns null
updateFile('feature_games_scoring.txt', [
  {
    search: 'CV (Coefficient of Variation) = `sd(rts) / mean(rts)`',
    replace: 'CV (Coefficient of Variation) = `sd(rts) / mean(rts)`. Nếu N < 10, trả về `null` thay vì `1.0` để caller tự xử lý.'
  }
]);

// Nit: Shadow Mode missing column
updateFile('feature_anticheat_observability.txt', [
  {
    search: 'Shadow mode: Bật shadow mode 2 tuần cho mọi luật hard mới: ghi flag nhưng vẫn accept, đo FP thật, rồi mới enforce.',
    replace: 'Shadow mode: Thêm cột `mode (\'shadow\'|\'enforced\')` trên `cheat_flags`. Bật shadow mode 2 tuần cho mọi luật hard mới: ghi flag nhưng vẫn accept, đo FP thật, rồi mới enforce. Việc ghi override severity đọc từ bảng `inspector_overrides` tại runtime để cập nhật nhanh.'
  }
]);

// Nit: A11y Accessible Practice mode
updateFile('feature_games_scoring.txt', [
  {
    search: '+ LƯU Ý: Tạo view `engagement_sessions` (UNION của training và practice có ranked flag).',
    replace: '+ LƯU Ý: Tạo view `engagement_sessions` (UNION của training và practice có ranked flag). Chế độ chơi Accessible Practice (cho phép pause không giới hạn thời gian) sẽ được lưu vào `practice_sessions` với `provenance=\'accessible\'` (không ảnh hưởng hạng).'
  }
]);

console.log("P0-P2 fixes completed");
