# Operations Dashboard — SQL Queries

Tài liệu này chứa các truy vấn SQL cốt lõi để theo dõi "sức khỏe" của hệ thống MindGem. Bạn có thể dán các truy vấn này vào Supabase SQL Editor, hoặc dùng làm nguồn dữ liệu (Data Source) cho Grafana/Metabase.

## 1. Request Volume & Error Rates (Theo giờ)

Đo lường lưu lượng truy cập và tỷ lệ lỗi (5xx) của các API quan trọng.

```sql
SELECT
  date_trunc('hour', window_start) AS hour,
  sum(request_count) AS total_requests,
  sum(request_count) FILTER (WHERE status_code >= 500) AS errors_5xx,
  sum(request_count) FILTER (WHERE status_code = 422) AS anticheat_422,
  sum(request_count) FILTER (WHERE status_code >= 500) * 100.0 / NULLIF(sum(request_count), 0) as error_rate_pct
FROM http_metrics_minute
WHERE window_start > now() - interval '48 hours'
GROUP BY 1 
ORDER BY 1 DESC;
```

## 2. Latency (Độ trễ API)

Đo lường tốc độ phản hồi của API. SLO mục tiêu: p95 < 500ms (95% request phải phản hồi dưới 500ms).
Sử dụng các cumulative bucket `le_500`, `le_2000`, `request_count` để tính toán chính xác.

```sql
SELECT
  path,
  sum(request_count) AS total_requests,
  sum(le_500) * 100.0 / NULLIF(sum(request_count), 0) AS pct_under_500ms,
  sum(request_count) - sum(le_2000) AS requests_over_2000ms
FROM http_metrics_minute
WHERE window_start > now() - interval '24 hours'
GROUP BY 1;
```

## 3. Anti-cheat Statistics (Thống kê Gian lận)

Theo dõi số lượng cờ gian lận (cheat flags) được phát lên, chia theo game và độ nghiêm trọng.
**SLO Mục tiêu:** False Positive Rate < 0.5% VÀ Unreviewed < 50.

```sql
-- Alias: fp_rate_random_sample
SELECT
  count(c.id) filter (where c.review_status = 'false_positive')::numeric / nullif(count(c.id) filter (where c.review_status is not null), 0) * 100 as fp_rate_pct,
  count(c.id) filter (where c.review_status is null) as unreviewed
FROM cheat_flag_review_queue q
JOIN cheat_flags c ON q.flag_id = c.id
WHERE q.sampled_at > now() - interval '7 days';
```

```sql
SELECT 
  game,
  severity,
  count(*) as flag_count,
  count(*) * 100.0 / sum(count(*)) over() as pct_of_total
FROM cheat_flags
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

**Truy vấn tỷ lệ Reject tổng quát:**
*Ghi chú: Phải lấy dữ liệu dựa trên trạng thái (state) và finalized_at của `round_tickets` để tính chính xác cho mọi ván đã kết thúc.*

```sql
SELECT
  count(*) FILTER (WHERE state = 'rejected') * 100.0 
  / NULLIF(count(*) FILTER (WHERE state IN ('accepted', 'rejected')), 0) AS reject_pct
FROM public.round_tickets
WHERE finalized_at > now() - interval '7 days'
  AND provenance = 'online';
```


## 4. Offline Sync Health (Tình trạng Đồng bộ Offline)

Theo dõi số lượng round đồng bộ từ chế độ offline lên server.

```sql
SELECT
  event,
  level,
  count(*) as count
FROM observability_events
WHERE event LIKE 'offline_sync%'
  AND created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

## 5. Admin Activity Monitor (Hoạt động của Admin)

Audit log các hành động nhạy cảm do admin thực hiện.

```sql
SELECT 
  date_trunc('day', created_at) AS day,
  actor_id,
  action,
  count(*) as action_count
FROM admin_audit
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;
```

## 6. Game Popularity (Độ phổ biến của Games)

Đo lường số ván chơi thành công của từng game.

```sql
SELECT 
  game,
  count(*) as total_rounds,
  count(*) * 100.0 / sum(count(*)) over() as popularity_pct
FROM training_sessions
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 2 DESC;
```

---
*Lưu ý: Bạn có thể copy-paste thẳng các SQL này vào mục SQL Editor của Supabase. Để tiện theo dõi lâu dài, hãy thiết lập Grafana kết nối với database thông qua Role `grafana_ro` (Read-only) và tạo các biểu đồ (Time series, Bar chart) tương ứng.*


### 3.1. False Positive Rate (Mẫu ngẫu nhiên - Mục tiêu < 0.5%)
```sql
-- Cron hàng tuần: nạp mẫu
INSERT INTO cheat_flag_review_queue (flag_id, sampled_at)
SELECT id, now() FROM cheat_flags
WHERE severity = 'hard'
  AND created_at > now() - interval '7 days'
  AND review_status IS NULL
ORDER BY random() LIMIT 600;
```

