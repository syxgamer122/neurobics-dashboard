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
| `VITE_TELEMETRY_SAMPLE` | `1` | Tỷ lệ lấy mẫu cho debug/info (0..1) |
| `VITE_TELEMETRY_ENDPOINT` | Edge Function của project | Đổi đích khi test |

## Phía server — `supabase/functions/_shared/observability.ts`

- Middleware gắn `x-request-id` cho **mọi** response, in log JSON một dòng: `{ ts, level, event, requestId, method, path, status, durationMs }`. Lọc được, đếm được, không cần regex.
- `app.onError` trả về `{ error, requestId }` thay vì để stack tràn ra ngoài. Khi người dùng gửi ảnh lỗi kèm request id, bạn tra đúng một dòng.
- `logServerEvent(...)` dùng cho sự kiện nghiệp vụ; đã gắn vào chỗ từ chối anticheat (`anticheat.hard_reject`).
- Chỉ `5xx`, `429`, `422` được lưu vào DB — 200 OK chỉ nằm ở log, tránh phình bảng.
- `POST /server/telemetry`: không cần đăng nhập (lỗi hay xảy ra trước khi có session), nhưng bị chặn bằng 3 lớp: 60 lô/phút/IP, body ≤ 32KB, ≤ 20 sự kiện/lô.

### Quyền riêng tư và bảo mật

- Mọi text đi qua `scrubText`: JWT, `token=`, `password=`, `apikey=`, email, dãy số từ 9 chứ số → thay bằng nhãn. Làm sạch **hai lần**: trên client trước khi gửi và trên server trước khi ghi.
- `user_id` từ client luôn bị đặt thành `null` (client tự khai thì giả mạo được). Nhóm theo `session_id`, hoặc đối chiếu với log server cùng `request_id`.
- Bảng bật RLS và **không có policy nào** → `anon`/`authenticated` không đọc được dòng nào. Chỉ `service_role` ghi.

## Truy vấn

Dùng hai hàm security-definer (chỉ admin gọi được, kiểm tra `profiles.role = 'admin'`):

```sql
-- Lỗi gây hại nhất 24 giờ qua, đã nhóm theo vân tay
select * from public.observability_summary(24);

-- Sức khoỉ theo giờ: tổng sự kiện, số lỗi, p95 thời gian xử lý
select * from public.observability_health(24);
```

Dọn rác (giữ 30 ngày):

```sql
select public.prune_observability_events(30);
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

Quy ước tên: `mien.hanh_dong` (`api.load_profile`, `ui.crash`, `sw.register_failed`). Đặt tên nụcụ sẽ khiến việc nhóm lỗi vô nghĩa.
