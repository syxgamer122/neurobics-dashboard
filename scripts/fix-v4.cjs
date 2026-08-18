const fs = require('fs');
const path = require('path');
const DOCS_DIR = path.join('c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)', 'docs');

function update(file, replacements) {
    const p = path.join(DOCS_DIR, file);
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');
    for (let r of replacements) {
        c = c.replace(r.search, r.replace);
    }
    fs.writeFileSync(p, c);
}

// 1. Fix feature_games_scoring.txt (CV and GAMMA)
update('feature_games_scoring.txt', [
    { search: /Focus: Đo độ ổn định nhịp độ.*/, replace: "Focus: Đo độ ổn định nhịp độ (Coefficient of Variation - CV - Trả về `CvResult = { value: number, reliable: boolean }` để caller xử lý)." },
    { search: /focus = MAX \* diff \* 0\.92 \*.*/, replace: "focus = clamp(RATING_MAX * Math.pow(quality, GAMMA[game]['focus']));" },
    { search: /EMA/g, replace: "Trimmed Mean" }
]);

// 2. Fix feature_anticheat_observability.txt (CV null bug)
update('feature_anticheat_observability.txt', [
    { search: /cv\(xs\) sẽ tự động trả về `1\.0`.*/, replace: "cv(xs) trả về `{value: NaN, reliable: false}` nếu N < 10. Không phạt metronomic nếu !reliable." }
]);

// 3. Fix architecture-contracts.md (ADR-0006 Exception)
update('architecture-contracts.md', [
    { search: /cấm tuyệt đối thao tác `UPDATE` và `DELETE`/g, replace: "cấm tuyệt đối thao tác `UPDATE` và `DELETE` (Ngoại lệ: hàm `pseudonymize_audit_subject()` được phép UPDATE để gán user_id = NULL phục vụ erasure)." }
]);

console.log("Applied V4 fixes.");
