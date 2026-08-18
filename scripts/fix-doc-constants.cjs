const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join('c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)', 'docs');

function updateFile(filename, replacements) {
  const filepath = path.join(DOCS_DIR, filename);
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

// -------------------------------------------------------------------------------------------------
// P0-1 (Age 13 -> 16 fixes)
// -------------------------------------------------------------------------------------------------
updateFile('feature_auth_profile.txt', [
  {
    regex: /từ `1900` đến `năm hiện tại - 13`/g,
    replace: 'từ `1900` đến `năm hiện tại - 16`'
  },
  {
    regex: /Client validate year <= currentYear - 13/g,
    replace: 'Client validate year <= currentYear - 16'
  },
  {
    regex: /trg_check_min_age chặn cứng birth_year < 13 tuổi/g,
    replace: 'trg_check_min_age chặn cứng birth_year < 16 tuổi'
  }
]);

updateFile('feature_games_scoring.txt', [
  {
    regex: /13-17, 18-24/g,
    replace: '16-17, 18-24'
  }
]);

updateFile('feature_ui_dashboard.txt', [
  {
    regex: /year <= new Date\(\)\.getFullYear\(\) - 13/g,
    replace: 'year <= new Date().getFullYear() - 16'
  },
  {
    regex: /validate năm hiện tại - 13/g,
    replace: 'validate năm hiện tại - 16'
  }
]);

// -------------------------------------------------------------------------------------------------
// P0-2 (XFF and IP)
// -------------------------------------------------------------------------------------------------
updateFile('feature_auth_profile.txt', [
  {
    regex: /D\. RATE LIMITING.*`x-forwarded-for`/s, // Will manually fix this one
    replace: 'D. RATE LIMITING & SECURITY\nSử dụng thuật toán Rightmost-Untrusted (SSOT) từ `security.ts` để xác định `clientIp`. Mọi logic Rate Limit (kể cả Login và Signup) đều dùng chung IP này.'
  }
]);

// -------------------------------------------------------------------------------------------------
// P0-4 (MAX_OFFLINE_AGE_MS fixes)
// -------------------------------------------------------------------------------------------------
updateFile('feature_offline_pwa.txt', [
  {
    regex: /vượt quá 7 ngày tuổi \(`MAX_OFFLINE_AGE_MS = 7 \* 24 \* 3600_000`\)/g,
    replace: 'quá cũ, chúng sẽ bị đánh dấu `offline_stale` và cấp `XP = 0` thay vì bị từ chối'
  },
  {
    regex: /do anti-cheat hoặc quá 7 ngày/g,
    replace: 'do anti-cheat'
  }
]);

updateFile('version-policy.md', [
  {
    regex: /\(tối đa 7 ngày đối với offline queue\)/g,
    replace: '(không còn offline pending ticket sử dụng version đó)'
  },
  {
    regex: /ticket cũ nếu chưa quá 7 ngày/g,
    replace: 'ticket cũ nếu vẫn còn telemetry_schema_version thuộc cửa sổ hỗ trợ'
  },
  {
    regex: /backward ít nhất 7 ngày/g,
    replace: 'backward 2 version telemetry schema'
  }
]);


// -------------------------------------------------------------------------------------------------
// P2-4 (submitted_at = now() fixes)
// -------------------------------------------------------------------------------------------------
updateFile('feature_anticheat_observability.txt', [
  {
    regex: /Đốt ticket \(`submitted_at = now\(\)`\)/g,
    replace: 'Đốt ticket (`state = \'rejected\'`)'
  }
]);

// -------------------------------------------------------------------------------------------------
// P2-5 (IndexedDB vs LocalStorage fixes)
// -------------------------------------------------------------------------------------------------
updateFile('feature_auth_profile.txt', [
  {
    regex: /trong `IndexedDB`/g,
    replace: 'trong `localStorage`'
  }
]);
updateFile('feature_ui_dashboard.txt', [
  {
    regex: /lưu IndexedDB key/g,
    replace: 'lưu localStorage key'
  },
  {
    regex: /lưu theme lựa chọn vào `IndexedDB`/g,
    replace: 'lưu theme lựa chọn vào `localStorage`'
  },
  {
    regex: /\(IndexedDB, sessionStorage\)/g,
    replace: '(localStorage, sessionStorage)'
  }
]);
