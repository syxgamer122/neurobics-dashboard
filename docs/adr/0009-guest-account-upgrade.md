# ADR-0009: Guest Account Upgrade Strategy

## Trạng thái (Status)
Accepted (2026-08-16)

## Bối cảnh (Context)
Người dùng Guest muốn giữ lại dữ liệu khi đổi thiết bị. Trước đây có tài liệu gợi ý chỉ cần gọi `supabase.auth.updateUser` từ client. Tuy nhiên, việc client tự cập nhật không thể thay đổi an toàn trường `role` trong bảng `profiles` (bởi quyền UPDATE trên profiles đã bị khóa). Ngoài ra, nếu cho phép tự do gọi `updateUser`, kẻ tấn công có thể lợi dụng để leo thang đặc quyền.

## Giải pháp (State Machine)
Sử dụng endpoint đặc quyền trên server: `/server/upgrade-account` kết hợp với hệ thống **State Machine** lưu trong bảng `upgrade_operations`.

Quá trình thăng cấp diễn ra theo 5 bước (State Machine):
1. **pending_verification**: Guest gọi API `/server/upgrade-account` với email thực. Hệ thống sinh một `upgrade_operations` cho user với trạng thái pending, rồi gọi Supabase Auth gửi OTP.
2. **email_verified**: User nhập OTP thành công trên Supabase Auth.
3. **credentials_bound**: Server thiết lập mật khẩu mới do người dùng cung cấp.
4. **old_sessions_revoked**: Revoke toàn bộ JWT / session cũ của guest proxy để chống rò rỉ.
Trigger email chỉ chuyển `pending_verification -> email_verified`.
5. **completed**: Quá trình promote thực sự dùng duy nhất RPC `finalize_guest_upgrade_tx` (chỉ chạy sau khi `old_sessions_revoked` -> khóa upgrade_operation -> xác minh `target_email` & `expired/consumed` -> update `role = user` -> update operation = `completed` -> lưu `upgraded_at` -> commit).
   Sau hoàn tất: Yêu cầu đăng nhập lại. Các endpoint nhạy cảm từ chối token có `iat < upgraded_at`. Email thay đổi KHÔNG BAO GIỜ tự động thăng cấp role. Việc thăng cấp chỉ diễn ra qua RPC `finalize_guest_upgrade_tx` có khóa `FOR UPDATE` và đối chiếu session.

Yêu cầu CSDL:
```sql
CREATE UNIQUE INDEX one_live_upgrade_per_user ON public.upgrade_operations (user_id) 
WHERE state IN ('pending_verification', 'email_verified', 'credentials_bound', 'old_sessions_revoked');
```

Các trạng thái lỗi của operation:
- `expired`: Operation quá hạn.
- `failed`: Lỗi hệ thống hoặc sai mật khẩu.
- `cancelled`: Bị thay thế bằng operation mới.

Mỗi transition cần kiểm tra:
- Operation thuộc đúng user.
- User hiện vẫn là guest.
- Email mới khớp với `target_email` của operation.
- Operation chưa hết hạn và chưa bị consumed.
- Chỉ có tối đa một operation pending trên mỗi user (unique constraint).
- Replay attack được xử lý bằng kết quả idempotent.

## Hệ quả (Consequences)
- Dữ liệu hoàn toàn được giữ nguyên và UUID của tài khoản không đổi.
- Quy trình đảm bảo bảo mật cao, chống session hijacking.
