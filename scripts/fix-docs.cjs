const fs = require('fs');

// 1. data-retention.md
let dr = fs.readFileSync('docs/data-retention.md', 'utf8');
dr = dr.replace(/Cron A \(Chưa chơi\): Dọn dẹp Guest Accounts CHƯA BAO GIỜ có ván chơi nào sau \*\*30 ngày\*\* kể từ lúc tạo\.\s+- \*\*Cron B \(Đã chơi\)\*\*: Dọn dẹp Guest Accounts ĐÃ TỪNG chơi sau \*\*180 ngày\*\* không hoạt động \(để cho người dùng đủ thời gian tải app và khôi phục\)\./,
  "Cron A: Dọn dẹp Guest Accounts sau **30 ngày** kể từ lúc tạo, bất kể đã chơi hay chưa (để người dùng có đủ thời gian liên kết email).");
dr = dr.replace(/Cron B \(Đã chơi\): Dọn dẹp Guest Accounts ĐÃ TỪNG chơi sau \*\*180 ngày\*\*/g, 'Cron B: Dọn dẹp Guest Accounts ĐÃ TỪNG chơi sau **30 ngày**'); // fallback
fs.writeFileSync('docs/data-retention.md', dr);

// 2. runbook.md
let rb = fs.readFileSync('docs/runbook.md', 'utf8');
rb = rb.replace(/severity = 'hard'/g, "signal_class = 'physical'");
fs.writeFileSync('docs/runbook.md', rb);

// 3. feature_anticheat_observability.txt
let ac = fs.readFileSync('docs/feature_anticheat_observability.txt', 'utf8');
ac = ac.replace(/severity \(Kill switch khẩn cấp\)/g, "signal_class (Kill switch khẩn cấp)");
ac = ac.replace(/hạ mức phạt từ Hard -> Soft/g, "hạ mức phạt từ physical -> statistical");
ac = ac.replace(/p_severity/g, "p_signal_class");
fs.writeFileSync('docs/feature_anticheat_observability.txt', ac);

console.log('Fixed docs');
