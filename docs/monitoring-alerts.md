# Monitoring & Alerts

Hệ thống giám sát của MindGem dựa trên bảng `observability_events` và `cheat_flags` trong Supabase.

## SLO Targets (Mục tiêu Dịch vụ)

Chúng ta đo lường 4 Service Level Indicators (SLIs) cốt lõi:

1. **Submit Round Availability**: 99.5% success rate
   - Tỷ lệ các lượt chấm điểm thành công, đo lường trong 7 ngày gần nhất.
   - Lỗi 4xx (như user input sai) không tính vào lỗi hệ thống, chỉ tính lỗi 5xx.

2. **API Latency Budget (Submit Round)**:
   - Target: p95 < 500ms
  - Warning Threshold > 800ms
   - Đo lường độ trễ từ lúc Edge Function nhận request đến lúc trả về kết quả dựa trên phân phối bucket của `http_metrics_minute`.

3. **Offline Sync Success**: 99.0% batches process without 5xx
   - Tỷ lệ các batch đồng bộ dữ liệu offline thành công.

4. **Anti-cheat False Positive Rate**: < 0.5%
   - Tỷ lệ `false_positive` tính riêng trên mẫu ngẫu nhiên (`cheat_flag_review_queue`) để tránh selection bias từ người dùng khiếu nại. Mẫu 600 hard rejects/tuần.
   - Thà lọt cheater còn hơn block nhầm người chơi trung thực.

## Error Budget

Với SLO 99.5% cho Submit Round, Error Budget của chúng ta là **0.5%**.
Nghĩa là trong 10,000 lượt chơi, chúng ta cho phép tối đa 50 lượt gặp sự cố hệ thống (5xx). Nếu vượt quá mức này, ngưng tính năng mới và tập trung fix bug.

## SQL Dashboard Queries

Các truy vấn SQL để cấu hình Grafana/Datadog hoặc xem trực tiếp trên Supabase Log Explorer. Xem thêm file [operations-dashboard.md](./operations-dashboard.md) để biết các truy vấn chi tiết.

### 1. System Availability (2xx vs 5xx)
  - **Target:** 99.5%
  ```sql
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
  ```

### 1B. Admission Success Rate (2xx vs 429/422)
  - **Target:** 98.0%
  ```sql
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
  ```

### 1B. Admission Success Rate (2xx vs 429/422)
  - **Target:** 98.0%
  ```sql
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
  ```


-- SLI 2: Round Acceptance Rate (tính từ round_tickets)
-- SELECT count(*) FILTER (WHERE state='accepted') / NULLIF(count(*), 0) FROM round_tickets WHERE finalized_at > now() - interval '7 days';
```

### 2. Latency (p95 from Histogram Buckets)
- **Target:** p95 < 500ms (Hiểu chính xác là >= 95% request hoàn thành <= 500ms)
- **Warning Threshold:** < 95.0% đạt SLO

```sql
SELECT sum(le_500) * 100.0 / NULLIF(sum(request_count), 0) AS pct_within_slo
FROM http_metrics_minute
WHERE path = '/server/submit-round' AND window_start > now() - interval '24 hours';
```

### 3. Anti-cheat Reject Rate

*Ghi chú: Tỉ lệ Reject phải tính trực tiếp từ trạng thái `state` của ticket (bao gồm cả `practice_sessions`) để không bị thổi phồng.*

```sql
SELECT count(*) FILTER (WHERE state='rejected') * 100.0
     / NULLIF(count(*) FILTER (WHERE state IN ('accepted','rejected')), 0) AS reject_pct
FROM round_tickets WHERE finalized_at > now() - interval '7 days';
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
| **P0 (Outage)** | **Dead-man Switch (External Ping)**: `pg_cron` gọi webhook push (healthchecks.io) mỗi 5 phút. Nếu healthchecks.io không nhận được tín hiệu quá 15 phút -> Bắn Paging Alert (điện thoại). Ngoài ra cung cấp GET `/server/health` trả về `{ db: ok, last_cron_run: ts }` không yêu cầu auth để uptime monitor bên ngoài ping mỗi 60s. Alert nội bộ Postgres dùng mô hình outbox + retry thay vì pg_net trực tiếp. |
| **P1 (Critical)** | Lỗi 5xx có Burn-rate vi phạm (fast 5m & 1h @ 14.4x, slow 6h & 3d @ 6x) với `requests >= 50` | Hệ thống gửi Webhook qua Slack. On-call (có paging ngoài giờ) điều tra trong 5 phút. |
| **P2 (High)** | Tỉ lệ Hard Reject vượt % quy định so với baseline tuần trước | Bắn thông báo Slack kênh `#alerts-warning`. On-call cần điều tra trong vòng 30 phút. Rủi ro block nhầm user hàng loạt hoặc degrade trải nghiệm. |
| **P3 (Medium)** | `ticket_pool` idle < 20% capacity | Cảnh báo sớm, cron refill không theo kịp. Xử lý trong ngày. |
| **P4 (Low)** | Hoạt động Admin tăng đột biến | Log lại để audit. Review trong vòng 48 giờ. |
