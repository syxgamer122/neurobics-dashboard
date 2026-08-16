# ADR 0004: Manual Migration Rollback (Roll-forward Only)

## Status
Accepted

## Context
Nhiều framework quản lý database (như Prisma, Sequelize) cung cấp sẵn script `up` và `down` để tự động khôi phục DB về trạng thái trước đó. Tuy nhiên, với Supabase (sử dụng DDL SQL thuần), việc viết lệnh `down` thường phức tạp và rủi ro.

## Decision
Chúng ta quyết định không viết các lệnh rollback (down script) cho migration. Nếu một migration đã được push lên Production và gây lỗi, quy trình xử lý sẽ là "Roll-forward": Viết một file migration mới sửa lỗi đó, thay vì cố gắng rollback về file cũ.

## Consequences
- **Điểm lợi**: Tránh mất dữ liệu vô tình (DROP TABLE, DROP COLUMN) khi rollback tự động. Đơn giản hóa quá trình phát triển (chỉ viết tiến, không viết lùi).
- **Điểm bất lợi**: Khi lỗi xảy ra, developer phải mất thời gian viết migration mới thay vì ấn 1 nút để quay lại bản cũ. Bù lại, sự an toàn của dữ liệu người dùng được đặt lên cao nhất.
