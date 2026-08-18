const fs = require('fs');

function fixMojibake(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/bao g\?m x\? l\? idempotency b\?ng/g, 'bao gồm xử lý idempotency bằng');
  content = content.replace(/Thnh cng/g, 'Thành công');
  content = content.replace(/Th\?nh cng/g, 'Thành công');
  content = content.replace(/Guest g\?i API/g, 'Guest gọi API');
  content = content.replace(/x\? ly b\?ng k\?t qu\? idempotent/g, 'xử lý bằng kết quả idempotent');
  content = content.replace(/G\?i thm/g, 'Gọi thêm');
  content = content.replace(/c\? hon thnh no ln server/g, 'cờ hoàn thành nào lên server');
  content = content.replace(/Ki\?m tra/g, 'Kiểm tra');
  content = content.replace(/tr\? v\? status/g, 'trả về status');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

['docs/feature_offline_pwa.txt', 'docs/feature_auth_profile.txt', 'docs/feature_gamification_social.txt', 'docs/feature_games_scoring.txt'].forEach(fixMojibake);
