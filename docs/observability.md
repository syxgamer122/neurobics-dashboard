# Observability

> Trước bản vá: `logger.ts` **nuốt** mọi lỗi ở production (`if (IS_DEV) console.error(...)`), Edge Function chỉ có `logger(console.log)` dạng văn bản tức biến mất sau 24 giờ. Khi người dùng báo "không ghi được điểm", không có cách nào biết điều gì đã xảy ra.

## Kiến trúc

```
trình duyệt                          Edge Function                Postgres
────────────                          ────────────                ────────
captureError()  ─┐
 captureMessage() ├─ gộp + làm sạch ─► POST /server/telemetry ─► observability_events
 captureEvent()  ┘   (tối đa 20/lô)          (làm sạch lần 2)          │
ErrorBoundary   ─┘                                                     │
                     middleware mọi request ──► log JSON 1 dòng ─────┘
                                                (5xx/429/422 lưu DB)
```

## Phía client — `src/app/lib/observability.ts`

| Hàm | Dùng khi nào |
|---|---|
| `captureError(err, extra?)` | Bắt được exception (catch, ErrorBoundary) |
| `captureMessage(msg, level?, extra?)` | Trạng thái bất thường không có Error object |
| `captureEvent({ event, ... })` | Sự kiện nghiệp vụ (`sw.register_failed`, `round.submit`…) |
| `trackTiming(name, fn)` | Đo thời gian một tác vụ async, tự ghi cả khi lỗi |
| `setObservabilityUser(id)` | Gán user cho các sự kiện sau đó (chỉ dùng nội bộ) |
| `flushObservability()` | Đẩy ngay, trước khi rời trang |

`logError` / `logWarn` trong `logger.ts` giờ tự động đi qua lớp này ở production — **bạn không cần sửa các chỗ gọi cũ**. `initObservability()` được gọi một lần trong `main.tsx`, đăng ký `window.error` + `unhandledrejection` + tự flush khi tab ẩn.

Hành vi đáng chú ý:

- **Gộp trùng lặp**: cùng một "vân tay lỗi" trong 60 giây chỉ gửi 1 dòng với `count` tăng dần — một vòng lặp lỗi không thể làm sập bảng log.
- **Lấy mẫu**: `debug`/`info` theo `VITE_TELEMETRY_SAMPLE`; `warn`/`error`/`fatal` **luôn** gửi.
- **Không bao giờ ném lỗi**: toàn bộ nằm trong try/catch. Telemetry chết thì app vẫn chạy.
- **fetch keepalive**: sự kiện vẫn được gửi khi người dùng đóng tab.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_TELEMETRY_OFF` | — | `1` để tắt hoàn toàn |
| `VITE_TELEMETRY_SAMPLE` | `0.01` | Tỉ lệ lấy mẫu cho debug/info (0..1) |
| `VITE_TELEMETRY_ENDPOINT` | Edge Function của project | Đổi đích khi test |

## Phía server — `supabase/functions/_shared/observability.ts`

- Middleware gắn `x-request-id` cho **mọi** response, in log JSON một dòng: `{ ts, level, event, requestId, method, path, status_code, duration_ms }`. Lọc được, đếm được, không cần regex.
- `app.onError` trả về `{ error, requestId }` thay vì để stack tràn ra ngoài. Khi người dùng gửi ảnh lỗi kèm request id, bạn tra đúng một dòng.
- `logServerEvent(...)` dùng cho sự kiện nghiệp vụ; đã gắn vào chỗ từ chối anticheat (`anticheat.hard_reject`).
- Chỉ `5xx`, `429`, `422` được lưu vào DB — 200 OK chỉ nằm ở log, tránh phình bảng.
- `POST /server/telemetry`: không cần đăng nhập (lỗi hay xảy ra trước khi có session), nhưng bị chặn bằng 3 lớp: 60 lô/phút/IP, body ≤ 32KB, ≤ 20 sự kiện/lô.

### Quyền riêng tư và bảo mật

- Mọi text đi qua `scrubText`: JWT, `token=`, `password=`, `apikey=`, email, dãy số từ 9 chữ số → thay bằng nhãn. Làm sạch **hai lần**: trên client trước khi gửi và trên server trước khi ghi.
- `user_id` từ client luôn bị đặt thành `null` (client tự khai thì giả mạo được). Nhóm theo `session_id`, hoặc đối chiếu với log server cùng `request_id`.
- Bảng bật RLS và **không có policy nào** → `anon`/`authenticated` không đọc được dòng nào. Chỉ `service_role` ghi.

## Tối ưu Hiệu suất: Bảng `http_metrics_minute` và Histogram Buckets

Để đáp ứng nhu cầu truy vấn Dashboard và tính toán bách phân vị (p95) chính xác mà không cần lưu trữ dữ liệu raw quá lớn, MindGem sử dụng bảng `http_metrics_minute` với các Histogram buckets. Dashboard Vận hành có thể truy vấn số liệu trực tiếp thông qua endpoint `GET /server/admin-metrics` (Yêu cầu quyền `read`).

- Hàm RPC `record_http_metric` tự động nhóm dữ liệu vào các khoảng `< 100ms`, `< 300ms`, `< 500ms`, `< 800ms`, `< 2000ms`, và `+Inf`.
- Sử dụng `pg_cron` job để xóa các bản ghi `http_metrics_minute` cũ hơn 90 ngày.

## Truy vấn

### Tính xấp xỉ p95 Latency từ Bucket
(Ví dụ tính p95 trong 24 giờ qua cho `/server/submit-round`)
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
  -- Xấp xỉ p95 dựa trên bucket distribution
  public.histogram_p95(b_100, b_300, b_500, b_800, b_2000, total_requests) as p95_approx_ms
FROM buckets;
```

-- Lỗi gây hại nhất 24 giờ qua, đã nhóm theo vân tay
select * from public.observability_summary(24);

-- Sức khỏe theo giờ: tổng sự kiện, số lỗi, p95 thời gian xử lý
select * from public.observability_health(24);

Dọn rác (giữ 90 ngày cho raw events):

```sql
select public.prune_observability_events(90);
```

Nếu bật `pg_cron`, bỏ comment ở cuối file migration để hẹn chạy hàng ngày.

## Ba chỉ số nên xem mỗi tuần

1. `observability_summary(168)` — top 5 vân tay lỗi. Sửa từ trên xuống.
2. `observability_health(168)` — tỷ lệ `errors / events` theo giờ. Tăng đột biến = deploy vừa rồi có vấn đề.
3. Số `anticheat.hard_reject` — tăng bất thường nghĩa là có người đang thử gian lận, hoặc ngưỡng đang bắt oan người thật.

## Thêm một điểm đo mới

```ts
import { captureEvent, trackTiming } from "@/app/lib/observability";

captureEvent({ event: "round.start", level: "info", game: "schulte" });

const profile = await trackTiming("api.load_profile", () => fetchProfile(), {
  route: "/dashboard",
});
```

Quy ước tên: `mien.hanh_dong` (`api.load_profile`, `ui.crash`, `sw.register_failed`). Đặt tên tùy ý sẽ khiến việc nhóm lỗi vô nghĩa.

## Tích hợp Hệ thống Bên ngoài (External Integrations) & Fail-Open

Hệ thống giám sát được thiết kế theo nguyên tắc "Fail-Open", đảm bảo rằng các lỗi liên quan đến telemetry hoặc observability không bao giờ làm gián đoạn trải nghiệm chơi game chính của người dùng.

### 1. Nguyên tắc Fail-Open (Không làm sập ứng dụng)
- Mọi hàm ghi log (`captureEvent`, `captureError`) trên client đều được wrap trong block `try/catch` trống, để nếu lỗi xảy ra khi stringify vòng lặp hoặc hết dung lượng LocalStorage, ứng dụng không bị crash.
- Quá trình gửi payload `/server/telemetry` là fire-and-forget. API Endpoint trả về nhanh nhất có thể. Nếu lỗi mạng hoặc server trả về 5xx khi ghi log, client sẽ âm thầm bỏ qua (fail-open) thay vì báo lỗi cho người dùng.
- Trên Server (Edge Function), nếu chèn vào `observability_events` thất bại, hệ thống fallback in ra stdout (console.error) để hạ tầng đám mây tự xử lý, tuyệt đối không gián đoạn quá trình return response.

### 2. Trace Correlation (Khớp luồng dữ liệu)
Để theo dõi 1 luồng xử lý xuyên suốt từ lúc user nhấn nút cho đến khi DB cập nhật thành công:
- Sinh ra một UUID duy nhất (`correlation_id`) cho mỗi phiên người dùng (hoặc mỗi lượt chơi - round ticket).
- Gắn `correlation_id` vào header `x-trace-id` trong mọi request từ client. Tuy nhiên, server phải tự sinh `canonical_request_id` để đảm bảo tính duy nhất. `x-trace-id` từ client chỉ được xem là metadata không đáng tin cậy (`untrusted`), phải được validate định dạng UUID và giới hạn chiều dài để tránh cardinality abuse. `setObservabilityUser(id)` sẽ bị loại bỏ hoặc tự động trích xuất từ `auth.uid()`. UUID redaction phải nhận thức được field name để không redacts mất `request_id` và `trace_id`. `Edge background write` phải dùng cơ chế `waitUntil` để không bị runtime terminate.
- Trên Edge Function, mọi dòng log liên quan đến request đó đều được gắn `trace_id` và `canonical_request_id` này.

### 3. Tích hợp Sentry / Datadog
Hệ thống hiện tại lưu log tự thân vào `observability_events`, nhưng sẵn sàng xuất dữ liệu ra Sentry (Crash Reporting) hoặc Datadog (APM & Metrics) thông qua Supabase Log Drains:
- **Sentry**: Tích hợp tại lớp Client (`src/app/lib/observability.ts`) bằng cách bọc `captureException` của Sentry bên trong `captureError`.
- **Datadog**: Cấu hình Log Drain trên Supabase Dashboard để tự động đẩy mọi `console.error` và `observability_events` ra hệ thống log ngoài, không làm tăng latency cho Edge Function.
