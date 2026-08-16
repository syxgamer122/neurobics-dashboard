const fs = require('fs');

let dashPath = 'docs/feature_ui_dashboard.txt';
let dash = fs.readFileSync(dashPath, 'utf8');
dash += '\n\n* CHÚ THÍCH: Mặc dù hệ thống đã rebrand thành MindGem, các key lưu trữ (localStorage, sessionStorage) như `neurobics-ui-theme`, `neurobics.cached_profile`, `neurobics.offline_queue`, `neurobics.obs.session` được giữ nguyên tên cũ để không làm mất session và dữ liệu của người dùng hiện tại.*\n';
fs.writeFileSync(dashPath, dash);

// export từ 1 module: validation.ts
let valPath = 'supabase/functions/_shared/scoring/validation.ts';
if (fs.existsSync(valPath)) {
  let val = fs.readFileSync(valPath, 'utf8');
  val = val.replace(/const HARD_MIN_RT_MS\s*=\s*80;?/g, '');
  val = val.replace(/HARD_MIN_RT_MS/g, 'HUMAN_FLOOR_MS');
  if (!val.includes('import { HUMAN_FLOOR_MS')) {
     val = 'import { HUMAN_FLOOR_MS } from "../limits.ts";\n' + val;
  }
  fs.writeFileSync(valPath, val);
}
