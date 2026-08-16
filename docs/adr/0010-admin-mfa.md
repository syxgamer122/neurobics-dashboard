# ADR-0010: Bắt buộc xác thực đa yếu tố (MFA) cho Admin Endpoints

## Trạng thái
Accepted

## Bối cảnh
Mọi thao tác thay đổi điểm (Grant), xóa tài khoản (Delete), reset (Reset) đều rất nhạy cảm. Nếu quản trị viên bị lộ session cookie hoặc bị đánh cắp máy tính khi đang mở tab, toàn bộ hệ thống MindGem sẽ bị đe dọa.

## Giải pháp
- Tích hợp hàm `requireAdmin` để không chỉ kiểm tra Role mà còn đọc nguyên thủy token JWT trên Deno bằng `jsonwebtoken` hoặc parser tương đương (không phụ thuộc cache SDK), kiểm tra trường `aal` (Authenticator Assurance Level) phải bằng `aal2`.
- Khóa toàn bộ các Admin endpoint nếu `aal === 'aal1'` (nghĩa là chỉ đăng nhập bằng password). Trả về mã lỗi `AppErrorStatus` đặc thù để Client hiển thị UI yêu cầu nhập TOTP (Step-up Authentication).
- Sử dụng Short-lived Step-up Session: Thời gian hợp lệ của session `aal2` chỉ nên kéo dài trong khoảng thời gian ngắn (ví dụ 1-4 giờ) đối với Admin để giảm thiểu cửa sổ tấn công (Attack window) nếu máy tính bị bỏ quên mở khóa. Việc này giảm rủi ro đáng kể.
- Ghi nhận `admin_audit` cho mọi thao tác này để truy vết.

## Hệ quả
- Gây bất tiện nhẹ cho đội ngũ vận hành vì mỗi phiên làm việc phải xác thực điện thoại/TOTP.
- Triệt tiêu 99% rủi ro do đánh cắp JWT hay Session Hijacking tĩnh.
- Cần có `AppErrorStatus` rõ ràng để client tự động xử lý chuyển hướng.
