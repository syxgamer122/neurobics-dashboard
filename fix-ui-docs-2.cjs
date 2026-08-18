const fs = require('fs');

function fixUiDocs() {
  let content = fs.readFileSync('docs/feature_ui_dashboard.txt', 'utf8');
  content = content + `

### Bổ sung các chuẩn UI & A11y (Theo đánh giá AI mới nhất)
1. **postMessage Security**: Luôn kiểm tra origin và source để tránh giả mạo:
   \`\`\`typescript
   if (
     event.origin !== window.location.origin ||
     event.source !== iframeRef.current?.contentWindow
   ) {
     return;
   }
   \`\`\`
2. **Theme**: Dùng \`localStorage\` lưu theme thay vì IndexedDB để đảm bảo đồng bộ, tránh flash đen/trắng (FOUC).
3. **Toaster**: Không được hardcode giao diện \`dark\`. Khớp tự động với theme hiện tại.
4. **Accessibility (A11y)**: Mọi modal phải cài đặt Focus Trap (Khóa focus bên trong modal), lưu lại Restore Focus khi đóng modal, và đánh dấu \`aria-modal="true"\`.
5. **Reduced Motion**: Tuân thủ triệt để \`prefers-reduced-motion\` cho mọi hiệu ứng chuyển động.
6. **Service Worker Caching**: Bắt buộc precache hoặc runtime-cache các lazy chunks của game để đảm bảo chơi offline hoạt động hoàn hảo.
`;
  fs.writeFileSync('docs/feature_ui_dashboard.txt', content, 'utf8');
}
fixUiDocs();
