# ADR 0006: Append-Only Admin Audit

## Status
Accepted

## Context
Trong hệ thống MindGem, Admin (God Mode) có quyền cộng/trừ XP, mở khóa Game và thay đổi User Data. Rủi ro về "Rogue Admin" (Admin nội bộ lạm quyền hoặc tài khoản Admin bị hack) là rất lớn.

## Decision
Sử dụng thiết kế Append-Only (Chỉ thêm mới) cho bảng `admin_audit`.
Tất cả các API dành cho Admin đều bắt buộc phải ghi 1 dòng log xuống bảng `admin_audit`. Đồng thời, RLS Policy của Postgres chặn hoàn toàn quyền `UPDATE` và `DELETE` trên bảng này đối với tất cả mọi role (kể cả postgres superuser trên API).

## Consequences
- **Điểm lợi**: Bất kỳ thao tác Admin nào cũng để lại dấu vết trong thời gian retention (Audit Trail). Nếu Admin lạm quyền, họ không thể tự xóa log của chính mình.
- **Điểm bất lợi**: Bảng sẽ to dần theo thời gian. Đã khắc phục bằng Data Retention Policy (xóa log cũ sau 365 ngày thông qua background cron, chứ không dùng quyền API).

## Ngoại lệ
Ngoại lệ duy nhất: hàm prune_admin_audit() chạy SECURITY DEFINER dưới owner bảng, không nhận tham số, chỉ được DELETE WHERE created_at < now() - interval '365 days'. pg_cron gọi hàm này, không gọi DELETE trực tiếp. Mỗi lần chạy ghi lại một dòng vào chính admin_audit (số dòng đã xóa, khoảng thời gian).
