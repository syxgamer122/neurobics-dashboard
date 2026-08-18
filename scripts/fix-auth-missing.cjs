const fs = require('fs');
const path = require('path');
const DOCS_DIR = path.join('c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)', 'docs');

const p = path.join(DOCS_DIR, 'feature_auth_profile.txt');
let c = fs.readFileSync(p, 'utf8');

const missingText = `

E. Profile Caching & Decay
1. \`CACHE_TTL_MS\` = 7 ngày.
2. Quá trình lấy profile:
   - Đọc từ localStorage.
   - Gọi \`sanitizeProfile\` và \`hydrateProfile\`.

F. Quản lý Avatar
1. \`AVATAR_MAX_BYTES\`: 2MB.
2. \`AVATAR_MIME\`: JPEG/PNG/WebP/GIF.
3. Quy trình dọn file cũ khác extension.
4. Cache-bust bằng query \`?t=\` (timestamp).

G. Năm sinh
- Spec \`saveBirthYear\`: Chỉ lưu 1 lần, ràng buộc bằng DB. Trả về thông tin cập nhật cho UI.

H. Đổi mật khẩu
1. Yêu cầu mật khẩu cũ (re-auth).
2. Gọi \`auth.signInWithPassword\`.
3. Nếu thành công, gọi \`auth.updateUser\` cập nhật mật khẩu mới.
4. Đăng xuất các phiên cũ (tự động theo Supabase config).

I. Luồng Dữ Liệu
Sơ đồ: signup -> login -> avatar -> delete

1. Cô lập Service Role Key.
2. Bảo vệ thông tin cá nhân (PII Privacy).
3. Chống Bot / Auto Signup bằng Captcha.
4. Chống Tấn công Flood / Brute-force.

CƠ CHẾ LƯU TRỮ (STORAGE MATRIX)
| Key                     | Nơi lưu       | Lý do                                  |
| [brand]-ui-theme        | localStorage  | Đọc sync trước paint, tránh FOUC       |
| sb-* (session)          | localStorage  | Supabase Auth quản lý nguyên bản       |
| [brand].cached_profile  | localStorage  | Truy xuất đồng bộ, cấu trúc JSON nhỏ   |
| [brand].offline_queue   | IndexedDB     | Lưu trữ nhiều ván pending, có index    |
| [brand].obs.session     | sessionStorage| Chỉ sống trong tab                     |

Cấm gọi trực tiếp localStorage/indexedDB ngoài lib/storage/ — enforce bằng ESLint no-restricted-globals.
`;

// Append missing text before the end.
if (!c.includes('E. Profile Caching & Decay')) {
  c += missingText;
  fs.writeFileSync(p, c);
  console.log("Appended missing sections.");
} else {
  console.log("Sections already exist.");
}
