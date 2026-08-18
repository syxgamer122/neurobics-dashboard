const fs = require('fs');
const path = require('path');

const docsDir = path.join('c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)', 'docs');

function updateFile(filename, replacements) {
  const filepath = path.join(docsDir, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filename}`);
    return;
  }
  let content = fs.readFileSync(filepath, 'utf8');
  let changed = false;
  for (const r of replacements) {
    if (r.regex) {
      if (r.regex.test(content)) {
        content = content.replace(r.regex, r.replace);
        changed = true;
      } else {
        console.warn(`[${filename}] Could not find REGEX: ${r.regex}`);
      }
    } else if (content.includes(r.search)) {
      content = content.replace(r.search, r.replace);
      changed = true;
    } else {
      console.warn(`[${filename}] Could not find STRING: ${r.search.substring(0, 40)}...`);
    }
  }
  if (changed) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`Updated ${filename}`);
  }
}

updateFile('feature_admin.txt', [
  {
    regex: /-- KHÔNG xóa xp_events.*\(giữ audit trail\)/g,
    replace: '-- TUYỆT ĐỐI KHÔNG DELETE TRONG xp_events. Ghi đè bằng cách thay đổi stats_generation. Tránh phá vỡ invariant ledger.'
  },
  {
    regex: /6\. Role-Based Access Control \(RBAC\):/g,
    replace: '5b. Admin MFA Lockout Protection:\n   - CI Deploy Check: Chặn deploy nếu phát hiện Admin chưa enroll TOTP (`aal != aal2`).\n   - Dashboard cung cấp `/settings/security` cho Admin enroll TOTP + Recovery Codes.\n   - Break-glass Procedure: Chuẩn bị sẵn script vô hiệu hoá MFA tạm thời bằng service_role và Two-person rule trong runbook để cứu hộ khi Admin mất quyền kiểm soát.\n\n6. Role-Based Access Control (RBAC):'
  }
]);

updateFile('feature_games_scoring.txt', [
  {
    regex: /\*Công thức tính Rating \(EMA.*/g,
    replace: '*Công thức tính Rating (Robust Trimmed Mean)*:\n- Áp dụng Trimmed Mean trên 10 ván gần nhất (loại bỏ 20% cao nhất/thấp nhất) để tính rating ổn định, không phụ thuộc vào ván cuối cùng và không gây lạm phát EMA. Giữ giá trị `best_score` riêng biệt để hiển thị thành tích.'
  },
  {
    regex: /CV \(Coefficient of Variation\) = `sd\(rts\) \/ mean\(rts\)`/g,
    replace: 'CV (Coefficient of Variation) = `sd(rts) / mean(rts)`. Nếu N < 10, trả về `null` thay vì `1.0` để caller tự xử lý.'
  }
]);

updateFile('operations-dashboard.md', [
  {
    regex: /Các truy vấn SQL để cấu hình Grafana\/Datadog hoặc xem trực tiếp trên Supabase Log Explorer./g,
    replace: 'Các truy vấn SQL để cấu hình Grafana/Datadog (Sử dụng Role `grafana_ro` chỉ có quyền SELECT trên `http_metrics_minute` và views, KHÔNG kết nối bằng superuser) hoặc xem trực tiếp trên Supabase Log Explorer.'
  },
  {
    regex: /thiết lập Grafana kết nối trực tiếp với database Supabase bằng PostgreSQL data source/g,
    replace: 'thiết lập Grafana kết nối với database thông qua Role `grafana_ro` (Read-only)'
  }
]);
