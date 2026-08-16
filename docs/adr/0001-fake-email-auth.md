# ADR 0001: Fake Email Authentication (Guest Mode)

## Status
Superseded by [ADR 0007](0007-guest-server-side.md)

## Context
MindGem cần một cách để người dùng trải nghiệm ngay lập tức (Guest Mode) mà không cần đăng ký rườm rà. Tuy nhiên, hệ thống Supabase sử dụng Row Level Security (RLS) gắn liền với hàm `auth.uid()`, đòi hỏi mọi request sửa đổi dữ liệu (insert/update) phải thuộc về một User được xác thực bởi Supabase Auth.

## Decision
Chúng ta quyết định tạo ra một luồng "Fake Email" ẩn dưới màn hình "Guest Mode".
Khi user bấm "Chơi ngay" (Guest), client sẽ tự động sinh ra một email ảo (ví dụ: `guest-uuid@neurobics.local`) và đăng ký nó với Supabase Auth bằng một mật khẩu ngẫu nhiên. Mật khẩu này được lưu trong localStorage.
Về phía backend, hệ thống coi đây là một user hoàn toàn hợp lệ, nhưng trường `role` trong bảng `profiles` sẽ được đánh dấu là `guest`.

## Consequences
- **Điểm lợi**: Giữ nguyên kiến trúc RLS. Backend không cần viết thêm các ngoại lệ (bypass) bảo mật cho Guest. Khi Guest muốn nâng cấp thành tài khoản thật, chỉ cần Update Email và Password.
- **Điểm bất lợi**: Gây "rác" database auth nếu Guest không quay lại. (Đã khắc phục bằng Data Retention Policy xóa guest bỏ hoang).
