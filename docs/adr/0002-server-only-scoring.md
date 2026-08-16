# ADR 0002: Server-Only Scoring

## Status
Accepted

## Context
Trong game phát triển bằng web technologies (HTML/JS), dữ liệu trên client rất dễ bị can thiệp. Nếu để Frontend tự tính điểm (XP, Ratings, Cấp độ) rồi gửi lên Server, cheater có thể dễ dàng sửa API payload để hack vị trí Leaderboard.

## Decision
Áp dụng nguyên tắc "Server-Only Scoring". 
Client chỉ đóng vai trò thu thập "Telemetry thô" (như lịch sử click, mảng `rts` - reaction times, số lần nhấp sai). Gói dữ liệu thô này được gửi lên Supabase Edge Function (`/server/submit-round`). Tại đây, Server sẽ:
1. Validate format của Telemetry.
2. Chạy qua hệ thống Anti-cheat (Inspector).
3. Tính toán điểm số cuối cùng (Rating) và điểm kinh nghiệm (XP).
4. Ghi trực tiếp vào Database bằng một Transaction.

## Consequences
- **Điểm lợi**: Chống gian lận tuyệt đối ở tầng logic. Client không bao giờ quyết định điểm số của mình.
- **Điểm bất lợi**: Khó khăn hơn khi chơi Offline vì client không thể biết điểm thật của mình cho đến khi có mạng trở lại. (Client sẽ sử dụng logic cục bộ để tính toán một kết quả "Provisional / Non-authoritative" tạm thời, sau đó Server sẽ ghi đè kết quả thật khi mạng được kết nối lại).
