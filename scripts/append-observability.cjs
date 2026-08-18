const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('docs/observability.md', 'utf8');

const addition = `
## Tích hợp Hệ thống Bên ngoài (External Integrations) & Fail-Open

Hệ thống giám sát được thiết kế theo nguyên tắc "Fail-Open", đảm bảo rằng các lỗi liên quan đến telemetry hoặc observability không bao giờ làm gián đoạn trải nghiệm chơi game chính của người dùng.

### 1. Nguyên tắc Fail-Open (Không làm sập ứng dụng)
- Mọi hàm ghi log (\`captureEvent\`, \`captureError\`) trên client đều được wrap trong block \`try/catch\` trống, để nếu lỗi xảy ra khi stringify vòng lặp hoặc hết dung lượng LocalStorage, ứng dụng không bị crash.
- Quá trình gửi payload \`/server/telemetry\` là fire-and-forget. API Endpoint trả về nhanh nhất có thể. Nếu lỗi mạng hoặc server trả về 5xx khi ghi log, client sẽ âm thầm bỏ qua (fail-open) thay vì báo lỗi cho người dùng.
- Trên Server (Edge Function), nếu chèn vào \`observability_events\` thất bại, hệ thống fallback in ra stdout (console.error) để hạ tầng đám mây tự xử lý, tuyệt đối không gián đoạn quá trình return response.

### 2. Trace Correlation (Khớp luồng dữ liệu)
Để theo dõi 1 luồng xử lý xuyên suốt từ lúc user nhấn nút cho đến khi DB cập nhật thành công:
- Sinh ra một UUID duy nhất (\`correlation_id\`) cho mỗi phiên người dùng (hoặc mỗi lượt chơi - round ticket).
- Gắn \`correlation_id\` vào header \`x-trace-id\` trong mọi request từ client.
- Trên Edge Function, mọi dòng log liên quan đến request đó đều được gắn \`trace_id\` này.

### 3. Tích hợp Sentry / Datadog
Hệ thống hiện tại lưu log tự thân vào \`observability_events\`, nhưng sẵn sàng xuất dữ liệu ra Sentry (Crash Reporting) hoặc Datadog (APM & Metrics) thông qua Supabase Log Drains:
- **Sentry**: Tích hợp tại lớp Client (\`src/app/lib/observability.ts\`) bằng cách bọc \`captureException\` của Sentry bên trong \`captureError\`.
- **Datadog**: Cấu hình Log Drain trên Supabase Dashboard để tự động đẩy mọi \`console.error\` và \`observability_events\` ra hệ thống log ngoài, không làm tăng latency cho Edge Function.
`;

fs.appendFileSync('docs/observability.md', addition);
console.log('Appended to observability.md');
