# ADR 0005: Strict Offline Sync

## Status
Accepted

## Context
MindGem cho phép người chơi tiếp tục chơi khi rớt mạng, tạo ra các ván chơi Offline. Khi có mạng trở lại, ứng dụng phải gửi (sync) các ván này lên server. Tuy nhiên, môi trường offline tạo ra lỗ hổng rất lớn cho cheater (họ có thể sinh ra 100 ván chơi đạt điểm tối đa ở client rồi gửi 1 cục lên server).

## Decision
Đồng bộ Offline bị giới hạn bởi các quy tắc (Strict Constraints) ở Server:
1. Phải đi kèm `clientRoundId` và có cơ chế idempotency chống nộp đúp.
2. Dữ liệu nộp lên bị chấm bởi Anti-cheat mạnh tay y như dữ liệu online.
3. Batch-size bị giới hạn (tối đa gửi 25 round / 1 lần sync) để tránh spam.
4. Thời gian (Timestamp) do Server quyết định (dùng `now()` lúc sync thay vì tin tưởng vào `created_at` mà client cung cấp).

## Consequences
- **Điểm lợi**: Bịt kín lỗ hổng gian lận offline.
- **Điểm bất lợi**: Chơi offline quá lâu sẽ bị dồn một lúc, nhưng server sẽ từ chối nếu xử lý dồn dập (Rate Limit). Bảng xếp hạng của offline player sẽ bị trễ so với thực tế.
