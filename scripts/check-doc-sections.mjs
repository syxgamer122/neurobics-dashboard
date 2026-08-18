import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');

const requiredSections = {
  'feature_auth_profile.txt': [
    'E. Profile Caching',
    'F. Quản lý Avatar',
    'G. Năm sinh',
    'H. Đổi mật khẩu',
    'I. Xóa tài khoản',
    'STORAGE MATRIX'
  ],
  'feature_offline_pwa.txt': [
    'SERVER LAYER'
  ]
};

const BANNED_PATTERNS = [
  "Xóa Storage trực tiếp",
  "Xóa Auth trực tiếp",
  "Fallback xóa profile",
  "Admin Flow 4",
  "1 ticket active",
  "TextDecoder()",
  "90-180",
  "90–180",
  "7-30",
  "7–30",
  "median < 80ms",
  "median < 150ms -> hard",
  "saveBirthYear",
  "uploadAvatar() -> UPDATE profiles",
  "Database Trigger cấp quyền sau xác minh",
  "unsupported_schema\" (terminal: true)",
  "accuracy ** 1.2"
];

let allPass = true;
for (const [file, sections] of Object.entries(requiredSections)) {
  const filepath = path.join(DOCS_DIR, file);
  if (!fs.existsSync(filepath)) continue;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const section of sections) {
    if (!content.includes(section)) {
      console.error(`[ERROR] Missing section in ${file}: ${section}`);
      allPass = false;
    }
  }
}

// Banned patterns check across all docs
const files = fs.readdirSync(DOCS_DIR);
for (const file of files) {
  if (!file.endsWith('.txt') && !file.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
  for (const pattern of BANNED_PATTERNS) {
    if (content.includes(pattern)) {
      console.error(`[ERROR] Banned pattern "${pattern}" found in ${file}`);
      allPass = false;
    }
  }
}

if (!allPass) {
  process.exit(1);
} else {
  console.log("✅ check:doc-sections PASSED. No banned patterns found.");
}
