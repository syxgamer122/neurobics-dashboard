# ADR 0005: Strict Offline Sync (Practice-Only)

## Status
Accepted (Cập nhật sau đánh giá kiến trúc Tuần 4)

## Context
MindGem cho phép người chơi tiếp tục chơi khi rớt mạng qua PWA, tạo ra các ván chơi Offline. Khi có mạng trở lại, ứng dụng phải gửi (sync) các ván này lên server. Tuy nhiên, môi trường offline tạo ra lỗ hổng kiến trúc không thể vá: Server không thể xác nhận tính xác thực của `startedAt`, thời gian chơi, hoặc liệu ván chơi đó có phải do bot tự sinh ở client hay không.

## Decision
Đồng bộ Offline sẽ được gắn nhãn `provenance = 'offline_sync'` và chỉ đóng vai trò **Practice (Unranked)**:
1. Dữ liệu nộp lên từ queue offline chỉ mang tính chất thống kê, lịch sử, và cấp lượng XP khuyến khích (Engagement XP) bị giới hạn.
2. Tuyệt đối KHÔNG DÙNG dữ liệu offline để tính toán hoặc ảnh hưởng tới: Global Leaderboard, Competitive Rating (ELO), Personal Best cạnh tranh, Brain Age, hoặc các Achievement dựa trên điểm cao.
3. Vẫn yêu cầu `clientRoundId` để chống nộp trùng (Idempotency).
4. Vẫn thẩm định `zod` schema để tránh lưu rác.
5. Khi người dùng đang Offline, Client hiển thị điểm Provisional (Tạm tính) kèm biểu tượng "Unranked/Practice". Khi có mạng, Server ghi đè bằng kết quả cuối cùng với trust_level = unverified.

## Consequences
- **Điểm lợi**: Khắc phục triệt để lỗ hổng gian lận dữ liệu cạnh tranh từ Offline. Leaderboard và Brain Age luôn chính xác tuyệt đối 100%.
- **Điểm bất lợi**: Người chơi ở vùng sóng yếu sẽ không thể leo rank cạnh tranh. Họ chỉ có thể kiếm XP cày cuốc cơ bản để giữ daily streak.
