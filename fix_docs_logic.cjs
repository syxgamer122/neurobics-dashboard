const fs = require('fs');

// 1. feature_admin.txt
let adminPath = 'docs/feature_admin.txt';
if (fs.existsSync(adminPath)) {
  let admin = fs.readFileSync(adminPath, 'utf8');
  // Fix Reset achievements
  if (admin.includes('DELETE FROM public.user_achievements')) {
    admin = admin.replace(
      /DELETE FROM public.user_achievements[^;]*;/g, 
      "DELETE FROM public.user_achievements WHERE user_id = p_target;\n    DELETE FROM public.xp_events WHERE user_id = p_target AND game = 'achievement';"
    );
  }
  if (admin.includes('KHÔNG xóa xp_events')) {
    admin = admin.replace('KHÔNG xóa xp_events', 'KHÔNG xóa xp_events (ngoại trừ game = \\\'achievement\\\' để tránh double XP)');
  }
  // Admin 6.1 vs Flow 2
  admin = admin.replace(/requireAdmin\(user\.id\)/g, 'requireAdmin(c)');
  fs.writeFileSync(adminPath, admin);
}

// 2. feature_games_scoring.txt
let scoringPath = 'docs/feature_games_scoring.txt';
if (fs.existsSync(scoringPath)) {
  let scoring = fs.readFileSync(scoringPath, 'utf8');
  // Bayesian shrinkage
  scoring = scoring.replace(/MIN_POPULATION \(mặc định 10\) \* 4 \(32 người\)/g, 'MIN_POPULATION (mặc định 10) * 4 (40 người)');
  // Cognitive Index
  scoring = scoring.replace(/tính toán Chỉ số Nhận thức/g, 'tính toán Chỉ số Nhận thức (Cognitive Index theo server)');
  scoring = scoring.replace(/trung bình 5 trục/g, 'trung bình 5 trục (UI fallback, có thể lệch nếu chưa đủ game)');
  // (levelFromXp)
  scoring = scoring.replace(/\(levelFromXp\) \(levelFromXp\)/g, '(levelFromXp)');
  // Vật lý
  scoring = scoring.replace(/Dữ liệu Vât lý/g, 'Dữ liệu Vật lý');
  fs.writeFileSync(scoringPath, scoring);
}

// 3. feature_ui_dashboard.txt
let dashPath = 'docs/feature_ui_dashboard.txt';
if (fs.existsSync(dashPath)) {
  let dash = fs.readFileSync(dashPath, 'utf8');
  // Age gate
  dash = dash.replace(/1900 -> năm hiện tại/g, 'năm hiện tại - 13');
  dash = dash.replace(/1900 <= year <= new Date\(\)\.getFullYear\(\)/g, 'year <= new Date().getFullYear() - 13');
  // Origin check
  dash = dash.replace(/window\.addEventListener\("message", \(e\) => \{/g, 'window.addEventListener("message", (e) => {\n      if (e.origin !== window.location.origin) return;');
  // ui 6.1
  dash = dash.replace(/non-admin bấm "god" sẽ thấy AccessDeniedOverlay/g, 'non-admin sẽ bị ẩn tab');
  fs.writeFileSync(dashPath, dash);
}

// 4. feature_auth_profile.txt
let authPath = 'docs/feature_auth_profile.txt';
if (fs.existsSync(authPath)) {
  let auth = fs.readFileSync(authPath, 'utf8');
  // auth 7 past tense
  auth = auth.replace(/Giải pháp: Cấu trúc cache cần lưu/g, 'Giải pháp đã áp dụng: Cấu trúc cache lưu');
  auth = auth.replace(/Giải pháp: Bổ sung lệnh xóa account_recovery/g, 'Giải pháp đã áp dụng: Bổ sung lệnh xóa account_recovery');
  // auth 8 vs 8.2
  auth = auth.replace(/8\. CẬP NHẬT KIẾN TRÚC/g, '8.1. CẬP NHẬT KIẾN TRÚC');
  // MFA
  if (!auth.includes('MFA cho admin')) {
    auth = auth.replace(/8\.1\. CẬP NHẬT KIẾN TRÚC/g, 'Lưu ý MFA: Hiện chưa có luồng enroll MFA cho admin trên giao diện, admin cần enroll qua Supabase Dashboard trước khi requireAdmin(c) có hiệu lực.\n\n8.1. CẬP NHẬT KIẾN TRÚC');
  }
  fs.writeFileSync(authPath, auth);
}

// 5. feature_gamification_social.txt
let socialPath = 'docs/feature_gamification_social.txt';
if (fs.existsSync(socialPath)) {
  let social = fs.readFileSync(socialPath, 'utf8');
  // gamification 6.C
  if (!social.includes('15 req/5 phút')) {
    social = social.replace(/debounce 350ms/g, 'debounce 350ms, rate limit DB-level 15 req/5 phút');
  }
  fs.writeFileSync(socialPath, social);
}

// 6. feature_anticheat_observability.txt
let antiPath = 'docs/feature_anticheat_observability.txt';
if (fs.existsSync(antiPath)) {
  let anti = fs.readFileSync(antiPath, 'utf8');
  anti = anti.replace(/Thà lót/g, 'Thà lọt');
  anti = anti.replace(/lỗi未chịu xử lý/g, 'lỗi chưa được xử lý');
  anti = anti.replace(/không bảo hòa/g, 'không bão hòa');
  anti = anti.replace(/sat biên/g, 'sát biên');
  anti = anti.replace(/Đội ngũ/g, 'Cỡ mẫu');
  fs.writeFileSync(antiPath, anti);
}

