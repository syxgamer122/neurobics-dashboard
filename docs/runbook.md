# Runbook: Xử lý Sự cố Production

Tài liệu này hướng dẫn cách chẩn đoán và khắc phục các sự cố thường gặp trên môi trường Production của MindGem.

## 1. Dịch vụ báo 5xx hàng loạt

**Dấu hiệu**: Alert P1 kích hoạt, Submit Round Error Rate > 5%.

**Chẩn đoán**:
1. Bước 0: Xem volume tổng từ `http_metrics_minute` trước để xác nhận bão lỗi.
   ```sql
   SELECT date_trunc('minute', window_start) as minute, sum(request_count) as requests, sum(request_count) filter (where status_code >= 500) as errors_5xx 
   FROM http_metrics_minute 
   WHERE window_start > now() - interval '2 hours' 
   GROUP BY 1 ORDER BY 1 DESC;
   ```
1. Xem log Supabase Edge Functions:
   - Truy cập Supabase Dashboard -> Edge Functions -> Logs.
   - Hoặc chạy query trên `observability_events`:
     ```sql
     SELECT context->>'message' as error_message, context->>'stack' as stack_trace, count(*) 
     FROM observability_events 
     WHERE status_code >= 500 AND created_at > now() - interval '1 hour'
     GROUP BY 1, 2 ORDER BY 3 DESC;
     ```
1. Kiểm tra Database Connection: Xem Supabase database có bị quá tải connection không (PgBouncer).
1. Kiểm tra các thay đổi gần đây: Xem lịch sử Vercel deploy hoặc GitHub commits.

**Khắc phục**:
- Nếu lỗi do code mới: Revert PR hoặc redeploy phiên bản cũ trên Vercel.
- Nếu lỗi do Database quá tải: Kill các query bị treo hoặc tạm thời scale up Supabase compute.

---

## 2. Người chơi bị văng ra lúc nộp điểm (422)

**Dấu hiệu**: User báo cáo bị văng, hoặc alert P2 Anti-cheat kích hoạt.

**Chẩn đoán**:
1. Chạy query tìm user bị reject:
   ```sql
   SELECT user_id, game, reason, telemetry, created_at
   FROM cheat_flags
   WHERE severity = 'hard' AND created_at > now() - interval '24 hours'
   ORDER BY created_at DESC;
   ```
1. Phân tích `telemetry`: Xem data có thực sự là cheat không (ví dụ: speed quá ảo) hay là do thiết bị lag/accessibility (cần check các trường hợp ngoại lệ như màn hình cảm ứng lỗi).

**Khắc phục**:
- Chuyển sang Runbook #6 (Anti-cheat False Positive Spike) nếu là lỗi hàng loạt.
- Nếu là một user cụ thể bị oan, có thể xóa cờ cheat bằng admin panel hoặc SQL.

---

## 3. Database Migration bị treo

**Dấu hiệu**: GitHub Actions CI fail ở bước `Supabase CLI` hoặc lúc deploy Supabase migrations không thành công.

**Chẩn đoán**:
- Xem log của bước CI bị lỗi. Tìm câu báo lỗi của Postgres (thường là lock timeout hoặc relation already exists).

**Khắc phục**:
1. Không bao giờ chạy thủ công câu SQL thay thế cho migration.
1. Xóa migration lỗi (nếu chưa push lên production) và tạo lại.
1. Nếu migration đã kẹt trên production (ví dụ: tạo index mất nhiều giờ), có thể phải chạy `pg_cancel_backend` để ngắt câu lệnh đang chạy.

---

## 4. Bão spam tài khoản Guest

**Dấu hiệu**: Số lượng row trong bảng `profiles` tăng đột biến, xuất phát từ cùng một dải IP hoặc không có hoạt động chơi game nào.

**Chẩn đoán**:
- Query xem số tài khoản Guest tạo trong 1 giờ qua:
  ```sql
  SELECT count(*) FROM profiles WHERE role = 'guest' AND created_at > now() - interval '1 hour';
  ```

**Khắc phục**:
- Bật hoặc tăng cường Cloudflare Turnstile cho màn hình Guest Login.
- Bật tính năng Rate Limiting trên Supabase API Gateway.
- Chạy script dọn dẹp các tài khoản Guest rác (không có hoạt động nào sau stats_epoch).

---

## 5. Feature Flag / Disable Game Nhanh

**Dấu hiệu**: Phát hiện một game có bug nghiêm trọng (ví dụ: lỗ hổng tính điểm), cần tạm dừng ngay lập tức.

**Khắc phục**:
1. Thay đổi trạng thái game thành `disabled` hoặc `internal` trong cơ sở dữ liệu:
   - Truy cập bảng `feature_flags` trên Supabase (hoặc chạy SQL Update).
   ```sql
   UPDATE feature_flags SET status = 'disabled' WHERE feature = 'game:schulte';
   ```
1. Gọi Edge Function hoặc Webhook để **Invalidate Cache** các feature flags, đảm bảo Edge Function áp dụng thay đổi ngay lập tức mà không cần chờ TTL.
1. **Verify**: Mở trang web ở cửa sổ ẩn danh và kiểm tra xem game đã biến mất hoặc bị vô hiệu hóa chưa.

---

## 6. Anti-cheat False Positive Spike

**Dấu hiệu**: Tỉ lệ `hard_reject` nhảy vọt (Alert P2), nhiều người chơi trung thực phàn nàn bị hệ thống không công nhận điểm.

**Chẩn đoán**:
1. Tìm phiên bản `INSPECTOR_VERSIONS[game]` hiện tại trong `supabase/functions/_shared/anticheat.ts`.
1. Truy vấn danh sách các reject gần nhất:
   ```sql
   SELECT game, reason, count(*) 
   FROM cheat_flags 
   WHERE severity = 'hard' AND created_at > now() - interval '2 hours'
   GROUP BY 1, 2 ORDER BY 3 DESC;
   ```
1. Xem xét pattern: Có phải chỉ tập trung ở một game cụ thể không? Có phải do một thiết bị cụ thể (ví dụ: điện thoại Android giá rẻ báo `rts` chậm) không?

**Khắc phục**:
- **Tạm thời**: Hạ cấp ngưỡng phạt. Chuyển logic từ `hard_reject` sang `soft_flag` trong `anticheat.ts` cho loại vi phạm đó.
- Revert `INSPECTOR_VERSIONS[game]` về bản trước nếu bản cập nhật gần nhất là nguyên nhân.
- Tạo issue phân tích lại data, thêm test case mới vào `tests/fixtures/anticheat-cases.json` để phòng ngừa regression.

---

## 7. Database Backup & Restore

**Chính sách Backup**:
- Supabase tự động backup hàng ngày (Daily backups) và hỗ trợ Point-in-Time Recovery (PITR) cho các gói Pro trở lên.

**Quy trình Khôi phục (Restore)**:
1. **Ưu tiên Point-in-Time Recovery (PITR) in-place**: Sử dụng tính năng PITR của Supabase để khôi phục trực tiếp trên project hiện tại. Điều này giữ nguyên JWT secret, đảm bảo tất cả refresh token của user (đặc biệt là tài khoản Guest) vẫn hợp lệ.
1. **Khôi phục sang Project mới (Chỉ dùng khi thảm họa toàn diện)**: Nếu project hiện tại bị hỏng hoàn toàn, có thể restore sang project mới. 
   - **CẢNH BÁO P0**: Project mới sẽ có JWT secret mới, toàn bộ phiên đăng nhập hiện tại sẽ mất. 
   - User có email/password có thể đăng nhập lại bình thường. 
   - **Tài khoản Guest sẽ bị mất vĩnh viễn** trừ khi họ đã lưu Recovery Code.
1. Kiểm tra tính toàn vẹn của dữ liệu sau khi restore:
   ```sql
   -- Verify users and their sessions
   SELECT count(*) FROM profiles;
   SELECT count(*) FROM training_sessions;
   SELECT count(*) FROM round_tickets;
   ```
1. Nếu restore sang project mới, thực hiện trỏ ứng dụng sang cơ sở dữ liệu mới (đổi `VITE_SUPABASE_URL` và Keys).
1. (Mục tiêu: RTO < 4 giờ, RPO < 24 giờ - cần test định kỳ và ghi nhận số thực tế).

---

## 8. Admin bị khóa khỏi hệ thống do mất MFA

**Dấu hiệu**: Admin làm mất thiết bị cài ứng dụng Authenticator (Google Authenticator, Authy, v.v.), không thể đăng nhập với cấp độ AAL2 để vào Dashboard.

**Chẩn đoán**: Admin bị kẹt ở mức `aal1` và bị API `requireAdmin` chặn (báo lỗi 403 Forbidden).

**Khắc phục**:
1. Đăng nhập vào tài khoản Supabase (mức Platform - Project Owner).
1. Vào phần Authentication -> Users -> Tìm tài khoản Admin bị khóa.
1. Kéo xuống phần Security / MFA Factors và xóa bỏ (Delete) factor đã đăng ký cũ.
1. Yêu cầu Admin đăng nhập lại. Hệ thống sẽ nhận diện tài khoản ở mức `aal1`, sau đó Admin có thể vào trang Settings (hoặc chạy lại quy trình Enroll MFA) để quét mã QR và đăng ký thiết bị mới.
