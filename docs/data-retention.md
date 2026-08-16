# Data Retention Policy (Chính sách lưu trữ dữ liệu)

Để đảm bảo hiệu năng database và tuân thủ các nguyên tắc tối giản dữ liệu (data minimization), MindGem áp dụng chính sách tự động dọn dẹp các dữ liệu cũ hoặc không còn giá trị.

## 1. Dữ liệu Giám sát & Logs (Observability)
Các sự kiện API, logs hệ thống và lỗi (bảng `observability_events`) sinh ra dữ liệu rất lớn.
- **Thời gian lưu trữ**: 30 ngày.
- **Xử lý**: Xóa tự động các row có `created_at` cũ hơn 30 ngày.
- Bảng gộp `http_metrics_minute`: Lưu trữ 90 ngày. Xóa tự động các row có `window_start` cũ hơn 90 ngày.

## 2. Dữ liệu Anti-cheat (Cheat Flags)
Dùng để phân tích false-positive và report, nhưng không cần giữ vĩnh viễn.
- **Thời gian lưu trữ**: 90 ngày.
- **Xử lý**: Xóa tự động cờ gian lận (bảng `cheat_flags`) cũ hơn 90 ngày.

## 3. Lịch sử Thao tác Admin (Admin Audit)
Nhằm mục đích tuân thủ bảo mật, thao tác của admin được lưu dài hạn hơn.
- **Thời gian lưu trữ**: 365 ngày (1 năm).
- **Xử lý**: Xóa tự động các row cũ hơn 365 ngày.

## 4. Tài khoản Guest Bỏ Hoang
Khách (Guest) được tạo bằng cơ chế Fake Email Auth (ADR-0001), do đó tồn tại ở cả 2 bảng `auth.users` và `public.profiles`.
- **Định nghĩa "Bỏ hoang"**:
  - `role = 'guest'`
  - Không có hoạt động nào sau lần reset/tạo tài khoản gần nhất (`NOT EXISTS (SELECT 1 FROM public.training_sessions WHERE created_at > stats_epoch)` thay vì `total_xp = 0`).
  - Tài khoản được tạo cách đây quá 30 ngày.
- **Xử lý**: Xóa vĩnh viễn khỏi Database.
- **Cơ chế đặc thù**: Vì `auth.users` thuộc về Supabase Auth schema, `pg_cron` không thể can thiệp bằng API thông thường. Hệ thống sử dụng một **Supabase Edge Function** (`cleanup-guests`) chạy định kỳ mỗi đêm bằng Cron Trigger, gọi Supabase Admin API để xóa `auth.users`, qua đó trigger tự động cascade xuống `public.profiles`.

---

*Cơ chế thực thi: Các tác vụ dọn bảng Postgres nội bộ (`observability_events`, `http_metrics_minute`, `cheat_flags`, `admin_audit`) chạy tự động bằng `pg_cron`. Riêng dọn dẹp Guest bỏ hoang (vì liên quan tới `auth.users`) được thực thi độc lập thông qua Supabase Edge Function `cleanup-guests` và kích hoạt bằng Cron Trigger.*

## 5. Operations Contract (Cam kết Vận hành)

Để đảm bảo chính sách này không chỉ nằm trên giấy, team vận hành cam kết tuân thủ các quy tắc sau:
- **Job Owner**: Platform Team.
- **Schedule**: Chạy định kỳ lúc `02:00 AM UTC` mỗi ngày nhằm tránh ảnh hưởng đến peak hours của hệ thống.
- **Alerts & Failure Handling**:
  - Nếu Edge Function `cleanup-guests` thất bại (status != 200), Supabase tự động bắn log cấp độ `error`. Monitor Alert sẽ ping thẳng vào channel Slack `#alerts-warning`.
  - Platform Team có trách nhiệm điều tra và trigger lại hàm thủ công trong vòng 24h.
- **Verification Query**: Để kiểm tra tiến trình dọn dẹp hôm qua có chạy đúng không, sử dụng query sau:
  ```sql
  SELECT * FROM observability_events
  WHERE event = 'cron.cleanup_guests' 
    AND created_at > now() - interval '24 hours';
  ```
- **Legal Hold**: Bất kỳ dữ liệu nào vướng vào tranh chấp pháp lý sẽ được gắn nhãn (hoặc chuyển ra kho lưu trữ lạnh) trước chu kỳ dọn dẹp. Mọi thắc mắc liên hệ Data Protection Officer (DPO).
