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

// Fix M10: monitoring-alerts.md
const monitoringAvailability = `### 1. System Availability (2xx vs 5xx)
  - **Target:** 99.5%
  - **Warning Threshold:** < 99.0%
  - **Critical Threshold:** < 95.0%

  \`\`\`sql
  WITH metric AS (
    SELECT
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN count ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code >= 500 THEN count ELSE 0 END) AS failures,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 OR status_code >= 500 THEN count ELSE 0 END) AS eligible
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
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN count ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code IN (429, 422, 500, 502, 503) THEN count ELSE 0 END) AS failures,
      SUM(count) AS total
    FROM public.http_metrics_minute
    WHERE window_start > now() - interval '7 days'
  )
  SELECT successes * 100.0 / NULLIF(total, 0) AS admission_success_pct
  FROM metric;
  \`\`\`
`;

replaceRegex(
    'docs/monitoring-alerts.md',
    /### 1\. Availability \(Success Rate\)[\s\S]+?FROM metric;/,
    monitoringAvailability
);


// Fix M10: operations-dashboard.md
const rejectRateReplacement = `**Truy vấn tỷ lệ Reject tổng quát:**
*Ghi chú: Phải lấy dữ liệu dựa trên trạng thái (state) và finalized_at của \`round_tickets\` để tính chính xác cho mọi ván đã kết thúc.*

\`\`\`sql
SELECT
  count(*) FILTER (WHERE state = 'rejected') * 100.0 
  / NULLIF(count(*) FILTER (WHERE state IN ('accepted', 'rejected')), 0) AS reject_pct
FROM public.round_tickets
WHERE finalized_at > now() - interval '7 days'
  AND provenance = 'online';
\`\`\`
`;

replaceRegex(
    'docs/operations-dashboard.md',
    /\*\*Truy v[ấa]n tỷ lệ Reject tổng quát:\*\*[\s\S]+?AS reject_pct;\s+```/,
    rejectRateReplacement
);

// Fix M2: feature_anticheat_observability.txt
const antiCheatM2 = `Đồng bộ Pipeline xử lý bằng Decision Engine tập trung \`decide(signals: Signal[])\`. Các hàm inspector của từng game (ví dụ: \`resolveInspector(ticket.scorerVersion)\`) CHỈ sinh ra tín hiệu \`Signal { kind, mode }\` thay vì tự quyết định hard reject.
  \`\`\`typescript
  const signals = inspectRound(ticket.game, telemetry, serverElapsedMs);
  const decision = decide(signals);
  if (decision.hardReject) {
    await finalizeRejectedRoundTx(...);
  }
  \`\`\`
  Hard Reject YÊU CẦU >= 2 tín hiệu thống kê ĐỘC LẬP hoặc 1 tín hiệu vật lý. Rule mới bắt buộc qua Shadow Mode.`;

replaceRegex(
    'docs/feature_anticheat_observability.txt',
    /Đồng bộ Pipeline xử lý bằng Decision Engine tập trung `decide\(signals: Signal\[\]\)`\.[\s\S]+?Rule mới bắt buộc qua Shadow Mode\./,
    antiCheatM2
);

// Another M2 fix for inspectRound signature
replaceRegex(
    'docs/feature_anticheat_observability.txt',
    /- Gọi `inspectRound\(gameId, telemetry, serverElapsedMs\)`\./,
    "- Gọi `inspectRound(ticket.game, telemetry, serverElapsedMs)`."
);

console.log("Done");
