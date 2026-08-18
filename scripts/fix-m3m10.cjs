const fs = require('fs');

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

// 1. M4: feature_anticheat_observability.txt (Immutable Rule Set)
const ruleSetReplacement = `Hard Reject YÊU CẦU >= 2 tín hiệu thống kê ĐỘC LẬP hoặc 1 tín hiệu vật lý. Rule mới bắt buộc qua Shadow Mode.
Shadow mode: Thêm cột \`mode ('shadow'|'enforced')\` trên \`cheat_flags\`. Bật shadow mode 2 tuần cho mọi luật hard mới.
**Immutable Rule Set & Canonicalization**: Object config/rule set phải được canonicalize bằng chuẩn RFC 8785 trước khi tính SHA-256. Sử dụng \`DeepReadonly\` và \`deepFreeze()\` tại runtime.
**Safety Override**: Việc override severity (Kill switch khẩn cấp) không được phép ghi đè (UPDATE) dòng override cũ, bắt buộc tạo snapshot mới (Append-only) với \`rule_set_hash\` mới và chỉ được phép hạ mức phạt từ Hard -> Soft.`;
replaceRegex('docs/feature_anticheat_observability.txt', /Hard Reject YÊU CẦU >= 2 tín hiệu thống kê ĐỘC LẬP hoặc 1 tín hiệu vật lý[\s\S]+?để cập nhật nhanh\./, ruleSetReplacement);

// 2. M5: architecture-contracts.md (Atomic Version Pinning)
const pinningReplacement = `- **Pre-mint Ticket Pool (ADR-0008)**: Tránh phát sinh tải (cold-start) trong quá trình INSERT khi người dùng ấn "Start Round", hệ thống sử dụng một \`ticket_pool\` rỗng. Khi claim, hệ thống dùng \`FOR UPDATE SKIP LOCKED\` để cấp phát vé siêu tốc (chỉ 15ms). Pool chỉ chứa vé rảnh rỗi, KHÔNG CHỨA version ở thời điểm pre-mint. Trong 1 transaction duy nhất gọi \`/server/activate-round\`: claim vé, resolve toàn bộ \`RoundEngineManifest\`, snapshot config, và lưu vào DB.
- **Rolling Deployment Fail-Closed**: Quá trình \`resolveScorer()\` ném lỗi \`UnsupportedEngineVersionError\` sẽ buộc vé chuyển sang trạng thái failed, phát metric \`engine.unsupported_version\`, không crash backend.`;
replaceRegex('docs/architecture-contracts.md', /- \*\*Pre-mint Ticket Pool \(ADR-0008\)\*\*: Tránh phát sinh tải \(cold-start\) trong quá trình INSERT[\s\S]+?siêu tốc \(chỉ 15ms\)\./, pinningReplacement);

// 3. M3: feature_offline_pwa.txt (Offline Provenance & 207 Multi-Status)
const offlineReplacement = `- \`MAX_SYNC_BATCH\`: \`25\` - Số ván tối đa gửi lên server trong 1 HTTP request đồng bộ. Response sử dụng mã HTTP \`207 Multi-Status\` thay vì \`426\` toàn cục để báo lỗi từng ván cũ biệt lập.
- **Tính Nhất Quán Tuyệt Đối**: Offline practice bắt buộc sử dụng 2 nguồn Provenance phân lập: \`client_build_id\` / \`client_config_hash\` (Client khai báo, chỉ dùng để debug) và \`server_processing_manifest_hash\` / \`server_scorer_version\` (Logic thực tế dùng tại server khi sync). Schema version phải đọc từ client bundle registry, không hardcode.
- \`MAX_OFFLINE_AGE_MS\`: Ván cũ hơn 7 ngày gắn cờ \`provenance = 'offline_stale'\`, bắt buộc \`ranked=false, xp_eligible=false, quest_eligible=false, streak_eligible=false\`.`;
replaceRegex('docs/feature_offline_pwa.txt', /- `MAX_SYNC_BATCH`: `25` - Số ván tối đa gửi lên server trong 1 HTTP request đồng bộ\.[\s\S]+?streak_eligible=false`\./, offlineReplacement);

// 4. M7: feature_auth_profile.txt (Guest Upgrade Privilege Escalation)
const guestUpgradeReplacement = `RPC \`finalize_guest_upgrade_tx\` KHÔNG nhận password truyền vào, chỉ lấy auth token hợp lệ.
BẮT BUỘC thực thi: \`REVOKE EXECUTE ON FUNCTION finalize_guest_upgrade_tx FROM anon, authenticated, public\`. RPC này chỉ được gọi từ Backend Edge Worker có đặc quyền. Trong RPC, thực hiện \`FOR UPDATE\` trên \`upgrade_operations\` để khóa hàng, kiểm tra đúng user, đúng trạng thái \`old_sessions_revoked\` và token cũ đã vô hiệu hóa, ngăn chặn Privilege Escalation.`;
replaceRegex('docs/feature_auth_profile.txt', /RPC `finalize_guest_upgrade_tx` KHÔNG nhận password truyền vào, chỉ lấy auth token hợp lệ\./, guestUpgradeReplacement);

// 5. M8: data-retention.md (Retention SSOT)
const retentionReplacement = `C. Lịch Xóa Tự Động (Retention Cron Jobs)
1. **Cron A**: Dọn dẹp Guest Accounts CHƯA BAO GIỜ có ván chơi nào sau **30 ngày** kể từ lúc tạo.
2. **Cron B**: Dọn dẹp Guest Accounts ĐÃ TỪNG chơi sau **180 ngày** không hoạt động (để cho người dùng đủ thời gian tải app và khôi phục).
3. **Cron C**: Xóa Raw Telemetry sau **180 ngày** bất kể Guest hay User (bắt buộc tách raw data khỏi bảng \`training_sessions\`). Bảng tính điểm tổng hợp aggregate (\`training_sessions\`) giữ vô thời hạn đến khi tự xóa.`;
replaceRegex('docs/data-retention.md', /C\. Lịch Xóa Tự Động \(Retention Cron Jobs\)[\s\S]+?Tất cả tiến trình xóa này tuân thủ đúng 5 bước của Deletion Journal\./, retentionReplacement + "\nTất cả tiến trình xóa này tuân thủ đúng 5 bước của Deletion Journal.");

// 6. M9: feature_games_scoring.txt (Anti-cheat RT < 80ms)
const rt80Replacement = `+ \`HUMAN_FLOOR_MS\` (80ms): Giới hạn sinh lý con người. Validation schema (Zod) KHÔNG DÙNG để bắt lỗi sinh học này (Schema chỉ check kiểu dữ liệu, finite chống DoS). Mọi Reaction Time < 80ms sẽ được ghi nhận bởi **Signal Extractor** và đánh tín hiệu.
+ **Decision Engine**: Sẽ tự động kết luận là Soft/Hard tùy vào tỷ lệ tập hợp mẫu bất thường (tránh False Positive do lỗi trình duyệt).`;
replaceRegex('docs/feature_games_scoring.txt', /\+ `HUMAN_FLOOR_MS` \(80ms\): Giới hạn sinh lý con người\.[\s\S]+?câu trả lời < 80ms sẽ tự động bị server từ chối\./, rt80Replacement);

// 7. M9: False Positive Dashboard in operations-dashboard.md
const fpReplacement = `**Truy vấn Tỷ lệ Cảnh báo giả (False Positive Rate):**
*Ghi chú: Lấy từ \`effective_cheat_flag_review\` (chứa manual review append-only) thay vì update thẳng \`review_status\` của bảng \`cheat_flags\`.*`;
replaceRegex('docs/operations-dashboard.md', /\*\*Truy vấn Tỷ lệ Cảnh báo giả \(False Positive Rate\):\*\*\n\*Ghi chú: Lấy từ bảng review queue để đảm bảo.*\*/, fpReplacement);

// 8. M10: monitoring-alerts.md (Observability SLIs)
const observabilitySLIs = `### 1. System Availability (2xx vs 5xx)
  - **Target:** 99.5%
  \`\`\`sql
  WITH metric AS (
    SELECT
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN request_count ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code >= 500 THEN request_count ELSE 0 END) AS failures,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 OR status_code >= 500 THEN request_count ELSE 0 END) AS eligible
    FROM public.http_metrics_minute
    WHERE window_start > now() - interval '7 days'
      AND path = '/server/submit-round'
  )
  SELECT successes * 100.0 / NULLIF(eligible, 0) AS system_availability_pct
  FROM metric;
  \`\`\`

### 1B. Admission Success Rate (2xx vs 429/422)
  - **Target:** 98.0%
  \`\`\`sql
  WITH metric AS (
    SELECT
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN request_count ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code IN (422, 429) THEN request_count ELSE 0 END) AS failures,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 OR status_code IN (422, 429) THEN request_count ELSE 0 END) AS eligible
    FROM public.http_metrics_minute
    WHERE window_start > now() - interval '7 days'
      AND path = '/server/submit-round'
  )
  SELECT successes * 100.0 / NULLIF(eligible, 0) AS admission_success_pct
  FROM metric;
  \`\`\``;
replaceRegex('docs/monitoring-alerts.md', /### 1\. System Availability \(2xx vs 5xx\)[\s\S]+?FROM metric;\n  ```/, observabilitySLIs);

console.log("Done M4 to M10");
