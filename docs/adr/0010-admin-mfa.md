# ADR-0010: Bắt buộc xác thực đa yếu tố (MFA) cho Admin Endpoints

## Trạng thái
Accepted

## Bối cảnh
Mọi thao tác thay đổi điểm (Grant), xóa tài khoản (Delete), reset (Reset) đều rất nhạy cảm. Nếu quản trị viên bị lộ session cookie hoặc bị đánh cắp máy tính khi đang mở tab, toàn bộ hệ thống MindGem sẽ bị đe dọa.

## Giải pháp
- Tích hợp hàm `requireAdmin` để Verify signature bằng JWKS -> verify issuer/audience/expiry/subject -> require aal2 -> require capability -> require step-up grant ≤5 phút. Sử dụng `jose.jwtVerify`, không dùng parser tương đương. 
- Khóa toàn bộ các Admin endpoint nếu `aal === 'aal1'` (nghĩa là chỉ đăng nhập bằng password). Trả về mã lỗi `AppErrorStatus` đặc thù để Client hiển thị UI yêu cầu nhập TOTP (Step-up Authentication).
- Sử dụng Short-lived Step-up Session: Dùng grant riêng trên bảng `admin_step_up_grants` (`user_id`, `session_id`, `verified_at`, `expires_at`, `nonce_hash`, `consumed_at`). Lệnh read có thể dùng grant tái sử dụng trong 5 phút. Lệnh grant/reset yêu cầu recent step-up bắt buộc. Lệnh delete sử dụng one-time grant.
- Ghi nhận `admin_audit` cho mọi thao tác này để truy vết.

## Hệ quả
- Gây bất tiện nhẹ cho đội ngũ vận hành vì mỗi phiên làm việc phải xác thực điện thoại/TOTP.
- hạn chế rủi ro do đánh cắp JWT hay Session Hijacking tĩnh.
- Cần có `AppErrorStatus` rõ ràng để client tự động xử lý chuyển hướng.
