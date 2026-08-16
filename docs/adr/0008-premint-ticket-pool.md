# ADR-0008: Pre-mint Ticket Pool cho Game Rounds

## Trạng thái
Accepted

## Bối cảnh
Khi người dùng bắt đầu ván chơi (`POST /server/start-round`), Edge Function sẽ gọi `insert` vào bảng `round_tickets` để sinh vé và tạo `started_at` nhằm làm căn cứ đo lường thời gian chơi chính xác (server-authoritative). Tuy nhiên, thao tác `insert` đồng thời tạo ra độ trễ (cold-start) khá lớn tại Edge Function (khoảng 120ms). 

## Giải pháp
Sử dụng một cơ chế cấp phát vé thay vì tạo mới trực tiếp lúc runtime:
- Bảng `ticket_pool` lưu sẵn các vé (được tạo trước).
- Một RPC `start_round_with_pool` sẽ sử dụng kỹ thuật `FOR UPDATE SKIP LOCKED` của Postgres để lấy vé nhàn rỗi (idle) một cách tức thời, gán `user_id`, `game`, và ghi lại `started_at` = `now()`.

## Hệ quả
- **Tích cực**: Độ trễ khởi tạo ván chơi giảm xuống dưới 15ms. Tránh tình trạng tranh chấp (race condition) và block ở DB.
- **Dự phòng (Fallback)**: Nếu `ticket_pool` cạn kiệt, hàm DB sẽ tự động degrade: sinh vé mới (INSERT on the fly) với độ trễ ~120ms và trả về bình thường (chậm 120ms còn hơn báo lỗi 503 cho người dùng). Lỗi `pool.exhausted_fallback` sẽ được log để cảnh báo (P2). Cron job `fill_ticket_pool` chạy mỗi phút để duy trì đủ số vé (cụ thể: `idle >= 10 × peak_starts_per_minute`).
- **Tiêu cực / Cảnh báo**: Chỉ áp dụng cho các ván chơi **Online**. Ván chơi **Offline** vẫn bắt buộc phải để Client khai báo `startedAt` khi đẩy lên Server, vì Client không thể với tới `ticket_pool` lúc đang mất mạng.
