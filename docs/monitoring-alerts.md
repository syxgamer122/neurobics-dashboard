# Monitoring & Alerts

Hệ thống giám sát của MindGem dựa trên bảng `observability_events` và `cheat_flags` trong Supabase.

## SLO Targets (Mục tiêu Dịch vụ)

Chúng ta đo lường 4 Service Level Indicators (SLIs) cốt lõi:

1. **Submit Round Availability**: 99.5% success rate
   - Tỷ lệ các lượt chấm điểm thành công, đo lường trong 7 ngày gần nhất.
   - Lỗi 4xx (như user input sai) không tính vào lỗi hệ thống, chỉ tính lỗi 5xx.

2. **API Latency Budget (Submit Round)**:
   - Target: p95 < 500ms\n  - Warning Threshold > 800ms
   - Đo lường độ trễ từ lúc Edge Function nhận request đến lúc trả về kết quả dựa trên phân phối bucket của `http_metrics_minute`.

3. **Offline Sync Success**: 99.0% batches process without 5xx
   - Tỷ lệ các batch đồng bộ dữ liệu offline thành công.

4. **Anti-cheat False Positive Rate**: < 0.5%
   - Tỷ lệ `false_positive` tính riêng trên mẫu ngẫu nhiên (`cheat_flag_review_queue`) để tránh selection bias từ người dùng khiếu nại. Mẫu 50 hard rejects/tuần.
   - Thà lọt cheater còn hơn block nhầm người chơi trung thực.

## Error Budget

Với SLO 99.5% cho Submit Round, Error Budget của chúng ta là **0.5%**.
Nghĩa là trong 10,000 lượt chơi, chúng ta cho phép tối đa 50 lượt gặp sự cố hệ thống (5xx). Nếu vượt quá mức này, ngưng tính năng mới và tập trung fix bug.

## SQL Dashboard Queries

Các truy vấn SQL để cấu hình Grafana/Datadog hoặc xem trực tiếp trên Supabase Log Explorer. Xem thêm file [operations-dashboard.md](./operations-dashboard.md) để biết các truy vấn chi tiết.

### 1. Availability (Success Rate)
- **Target:** 99.5%
- **Warning Threshold:** < 99.0%
- **Critical Threshold:** < 95.0%

```sql
SELECT
  sum(request_count) FILTER (WHERE status_code < 500) * 100.0 / sum(request_count) AS success_rate_pct
FROM http_metrics_minute
WHERE window_start > now() - interval '7 days'
  AND path = '/server/submit-round';
```

### 2. Latency (p95 from Histogram Buckets)
- **Target:** p95 < 500ms
- **Warning Threshold:** p95 > 800ms
- **Note:** `http_metrics_minute` uses histogram buckets (`le_100`, `le_300`, `le_500`, `le_800`, `le_2000`) to approximate p95 directly in SQL.

```sql
WITH buckets AS (
  SELECT
    sum(le_100) AS b_100,
    sum(le_300) AS b_300,
    sum(le_500) AS b_500,
    sum(le_800) AS b_800,
    sum(le_2000) AS b_2000,
    sum(request_count) AS total_requests
  FROM http_metrics_minute
  WHERE path = '/server/submit-round'
    AND window_start > now() - interval '24 hours'
)
SELECT
  public.histogram_p95(b_100, b_300, b_500, b_800, b_2000, total_requests) as p95_approx_ms
FROM buckets;
```

### 3. Anti-cheat Reject Rate

*Ghi chú: Mẫu số (tổng lượt chơi) phải được lấy từ bảng `training_sessions` (những ván thành công) cộng với những ván bị reject, đếm theo số `round_id` độc nhất (distinct) để tránh tính lặp nếu một ván có nhiều cờ vi phạm.*

```sql
SELECT
  (SELECT count(DISTINCT round_id) FROM cheat_flags WHERE severity = 'hard' AND created_at > now() - interval '7 days') AS hard_rejects,
  (SELECT count(*) FROM training_sessions WHERE created_at > now() - interval '7 days') AS valid_sessions,
  (SELECT count(DISTINCT round_id) FROM cheat_flags WHERE severity = 'hard' AND created_at > now() - interval '7 days') * 100.0 
    / NULLIF((SELECT count(*) FROM training_sessions WHERE created_at > now() - interval '7 days') + 
           (SELECT count(DISTINCT round_id) FROM cheat_flags WHERE severity = 'hard' AND created_at > now() - interval '7 days'), 0) AS reject_pct;
```

### 4. Hourly Request Volume & Error Rate
```sql
SELECT
  date_trunc('hour', window_start) AS hour,
  sum(request_count) AS requests,
  sum(request_count) FILTER (WHERE status_code >= 500) AS errors_5xx,
  sum(request_count) FILTER (WHERE status_code = 422) AS anticheat_422
FROM http_metrics_minute
WHERE window_start > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1;
```

## Alert Engine Architecture

Hệ thống được tự động hóa bằng PostgreSQL:
- Bảng `alerts`: Lưu các cảnh báo được sinh ra với cơ chế `cooldown_until` để tránh spam (bão cảnh báo).
- Bảng `cron_runs`: Giám sát trạng thái của các cronjob báo cáo tình trạng hệ thống.
- Hàm `trigger_alert`: Gửi cảnh báo qua Slack (nếu cấu hình `app.slack_webhook_url` được thiết lập) thông qua extension `pg_net` cho các sự cố P0/P1.

## Escalation Policy (Chính sách leo thang sự cố)

Khi chuông báo động (alert) reo, mức độ ưu tiên xử lý như sau:

| Mức độ | Điều kiện kích hoạt | Hành động / SLA Xử lý |
|--------|---------------------|-----------------------|
| **P1 (Critical)** | Lỗi 5xx > 5% | Hệ thống gửi Webhook qua Slack. Bắt tay vào điều tra trong vòng 5 phút. |
| **P2 (High)** | Bão Anti-cheat: > 50 `hard_reject` / Ticket Pool trống | Bắn thông báo Slack kênh `#alerts-warning`. On-call cần điều tra trong vòng 30 phút. Rủi ro block nhầm user hàng loạt hoặc degrade trải nghiệm. |
| **P3 (Medium)** | Hàng đợi offline đầy > 150 / `ticket_pool` idle < 20% capacity | Cảnh báo sớm, cron refill không theo kịp. Xử lý trong ngày. |
| **P4 (Low)** | Hoạt động Admin tăng đột biến | Log lại để audit. Review trong vòng 48 giờ. |
