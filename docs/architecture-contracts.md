# System Architecture Contracts

Tài liệu này đóng băng các **Nguyên tắc Kiến trúc (Contracts)** cốt lõi của MindGem. Mọi tính năng phát triển mới BẮT BUỘC phải tuân thủ các contracts này. Các tài liệu tính năng (Feature Docs) chỉ đóng vai trò mô tả chi tiết cách triển khai các contracts này.

## 1. Auth & Guest Contract
- **Không tồn tại khái niệm "Local-only Guest"**: Mọi thao tác lưu trữ tiến trình bắt buộc phải gắn với một `auth.users` hợp lệ trên Supabase.
- **Fake Email Auth**: Người dùng "Chơi ngay" (Guest) sẽ được cấp một tài khoản Auth thực sự thông qua cơ chế tự động sinh Fake Email (ADR-0007).
- **Lợi ích**: Đảm bảo 100% dữ liệu tuân thủ Row Level Security (RLS) của Database mà không cần đục lỗ bảo mật cho Guest.

## 2. Offline & Scoring Contract
- **Server is Authoritative**: Máy chủ (Edge Functions) là nơi duy nhất có thẩm quyền chấm điểm (Rating, XP) thông qua dữ liệu Telemetry thô (ADR-0002).
- **Provisional Local Result**: Khi thiết bị mất mạng, Client sẽ sử dụng bộ chấm điểm nội bộ để hiển thị điểm tạm thời (**Provisional/Non-authoritative Result**) nhằm đảm bảo trải nghiệm người dùng không bị gián đoạn.
- **Strict Offline Sync**: Khi thiết bị có mạng trở lại, Client đóng gói Telemetry gửi lên Server. Server sẽ thẩm định và **ghi đè** kết quả Provisional bằng kết quả thật (ADR-0005).

## 3. Observability Contract
- **Telemetry Schema Canonical**: 
  - Toàn bộ HTTP Request gọi vào Server đều phải phát ra sự kiện `http.request`.
  - Từ chối sử dụng các tên gọi khác (như `server.request`, `api.request`).
  - Các trường bắt buộc: `duration_ms` (số nguyên, millisecond), `status_code`, `path`.
- **Log Persistence**: Để tính success rate và giám sát, mọi request đều được ghi nhận lightweight metric qua `recordHttpMetric`. Chỉ các sự kiện lỗi (status 5xx, 422, 429) hoặc sự kiện nghiệp vụ quan trọng mới được `_shared/observability.ts` ghi chi tiết vào bảng `public.observability_events`.
- **Metric Aggregation**: Để phục vụ truy vấn tốc độ cao cho Dashboard, dữ liệu HTTP sẽ được tự động gộp theo phút vào bảng `http_metrics_minute` (bằng pg_cron).
- **Dashboard Mapping**: Mọi câu query về lưu lượng hoặc độ trễ trong Operations Dashboard BẮT BUỘC phải query dựa trên bảng gộp `http_metrics_minute` này, thay vì query trực tiếp bảng raw.

## 4. CI / Validation Contract
- **Quy tắc chặn Merge**: Mọi Pull Request phải vượt qua 2 GitHub Checks bắt buộc:
  - `quality`: Xác thực tĩnh (Typecheck, Lint, Bundle Budget), Unit Tests, và Integration (Migration Apply Smoke, Playwright E2E).
  - `edge-functions`: Xác thực Typecheck trên môi trường Deno cho các API Server.
- CI là lớp phòng thủ cuối cùng. Vercel deployment chỉ được thực thi sau khi CI Passed.

## 5. Admin Authorization Contract
- **Role-based Gatekeeping**: Toàn bộ giao diện Admin và các Endpoint nguy hiểm được bảo vệ bởi rào cản `role === 'admin'`.
- **Append-Only Audit Trail**: Đổi lại việc sử dụng Role-based đơn giản, mọi hành động điều chỉnh điểm số (Grant/Reset) hay xóa tài khoản của Admin ĐỀU PHẢI được ghi lại vào bảng `admin_audit` (ADR-0006).
- **No Mutation allowed**: Row Level Security (RLS) của `admin_audit` cấm tuyệt đối thao tác `UPDATE` và `DELETE`, đảm bảo lịch sử lạm quyền (nếu có) không thể bị xóa bỏ bởi chính Admin.
- **MFA Required (ADR-0010)**: Bất kỳ Endpoint Admin nào cũng bắt buộc kiểm tra `aal === 'aal2'` trong JWT Token để đảm bảo tính an toàn chống lộ lọt cookie/token.

## 6. Performance & Recovery
- **Pre-mint Ticket Pool (ADR-0008)**: Tránh phát sinh tải (cold-start) trong quá trình INSERT khi người dùng ấn "Start Round", hệ thống sử dụng một `ticket_pool` và `FOR UPDATE SKIP LOCKED` để cấp phát vé siêu tốc (chỉ 15ms).
- **Guest Account Recovery (ADR-0009)**: Guest hoàn toàn có thể "nâng cấp" thành User chính thức mà không bị mất điểm bằng cách gọi endpoint `/server/upgrade-account`. Việc client tự ý gọi `updateUser()` bị cấm do rủi ro leo thang đặc quyền.
