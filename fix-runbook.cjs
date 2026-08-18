const fs = require('fs');

function fixRunbook() {
  let content = fs.readFileSync('docs/runbook.md', 'utf8');
  content = content.replace(/- Revert \INSPECTOR_VERSIONS.*?nguyA.*n nhA.*n\./s, 
    '- Không bao giờ giảm version. Nếu logic phiên bản mới sai, hãy revert code logic về bản cũ nhưng BẮT BUỘC TĂNG version (ví dụ: v3 lỗi, rollback logic về giống v2 nhưng gán version v4).');
  content = content.replace(/Append manual_review -> mark false_positive ->.*?\(append-only ledger\)\./s,
    'Append manual_review -> mark false_positive -> cấp compensation nếu cần -> tuyệt đối KHÔNG xóa cheat_flags (append-only ledger).');
  fs.writeFileSync('docs/runbook.md', content, 'utf8');
}
fixRunbook();
