import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cấu hình ngân sách dung lượng (Perf Budget)
const MAX_JS_CHUNK_SIZE_KB = 700; // Chunk lớn nhất không vượt 700KB
const MAX_TOTAL_JS_SIZE_KB = 1500; // Tổng JS không vượt 1.5MB
const MAX_CSS_SIZE_KB = 100; // Tổng CSS không vượt 100KB

const distAssetsPath = path.join(__dirname, '../dist/assets');

if (!fs.existsSync(distAssetsPath)) {
  console.error("❌ Thư mục dist/assets không tồn tại. Hãy chạy 'pnpm run build' trước.");
  process.exit(1);
}

const files = fs.readdirSync(distAssetsPath);

let totalJsSize = 0;
let totalCssSize = 0;
let maxJsChunkSize = 0;
let maxJsChunkName = '';

for (const file of files) {
  const filePath = path.join(distAssetsPath, file);
  const stats = fs.statSync(filePath);
  const sizeKb = stats.size / 1024;

  if (file.endsWith('.js')) {
    totalJsSize += sizeKb;
    if (sizeKb > maxJsChunkSize) {
      maxJsChunkSize = sizeKb;
      maxJsChunkName = file;
    }
  } else if (file.endsWith('.css')) {
    totalCssSize += sizeKb;
  }
}

let hasError = false;

console.log("📦 Báo cáo Bundle Size:");
console.log(`- Tổng dung lượng JS: ${totalJsSize.toFixed(2)} KB (Giới hạn: ${MAX_TOTAL_JS_SIZE_KB} KB)`);
console.log(`- Dung lượng JS Chunk lớn nhất (${maxJsChunkName}): ${maxJsChunkSize.toFixed(2)} KB (Giới hạn: ${MAX_JS_CHUNK_SIZE_KB} KB)`);
console.log(`- Tổng dung lượng CSS: ${totalCssSize.toFixed(2)} KB (Giới hạn: ${MAX_CSS_SIZE_KB} KB)`);
console.log("");

if (totalJsSize > MAX_TOTAL_JS_SIZE_KB) {
  console.error(`❌ VƯỢT NGƯỠNG: Tổng JS (${totalJsSize.toFixed(2)} KB) vượt ${MAX_TOTAL_JS_SIZE_KB} KB.`);
  hasError = true;
}
if (maxJsChunkSize > MAX_JS_CHUNK_SIZE_KB) {
  console.error(`❌ VƯỢT NGƯỠNG: Chunk JS lớn nhất (${maxJsChunkName}: ${maxJsChunkSize.toFixed(2)} KB) vượt ${MAX_JS_CHUNK_SIZE_KB} KB.`);
  hasError = true;
}
if (totalCssSize > MAX_CSS_SIZE_KB) {
  console.error(`❌ VƯỢT NGƯỠNG: Tổng CSS (${totalCssSize.toFixed(2)} KB) vượt ${MAX_CSS_SIZE_KB} KB.`);
  hasError = true;
}

if (hasError) {
  console.error("\n❌ Bundle Budget Check Failed. Vui lòng kiểm tra lại dependencies hoặc tối ưu code-splitting.");
  process.exit(1);
} else {
  console.log("✅ Bundle Budget Check Passed! Kích thước ứng dụng trong mức an toàn.");
}
