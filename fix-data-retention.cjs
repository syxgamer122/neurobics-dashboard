const fs = require('fs');
let content = fs.readFileSync('docs/data-retention.md', 'utf8');

content = content.replace(/Khách \(Guest\):[\s\S]*?sau 30 ngày\./s, `Khách (Guest):
- Guest chưa từng chơi: Xóa sau 30 ngày.
- Guest đã chơi nhưng chưa nâng cấp: Cảnh báo, sau đó xóa sau 90-180 ngày không hoạt động.
- User chính thức: Giữ tới khi tự xóa.
- Raw telemetry: Giữ 90-180 ngày.
- Aggregated history/score: Giữ tới khi xóa tài khoản.`);

content = content.replace(/SELECT p\.id FROM public\.profiles p WHERE p\.role = 'guest'/g, 
`SELECT p.id FROM public.profiles p WHERE p.role = 'guest' AND coalesce(p.last_activity_at, p.created_at) < now() - interval '30 days'`);

fs.writeFileSync('docs/data-retention.md', content, 'utf8');
console.log('Fixed data-retention');
