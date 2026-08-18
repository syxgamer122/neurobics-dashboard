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
    console.log("Updated", file);
}

// 1. Restore & Fix feature_auth_profile.txt
update('feature_auth_profile.txt', [
    { search: /13 tuổi/g, replace: '16 tuổi' },
    { search: /currentYear - 13/g, replace: 'currentYear - 16' },
    { search: /năm hiện tại - 13/g, replace: 'năm hiện tại - 16' },
    { search: /trong IndexedDB/g, replace: 'trong localStorage' },
    { search: /trong `IndexedDB`/g, replace: 'trong `localStorage`' },
    { search: /lấy giá trị do client gửi, nếu hạ tầng phía trước append IP thật vào cuối chuỗi.*/g, replace: 'sử dụng thuật toán Rightmost-Untrusted (SSOT) từ `security.ts` để lấy IP thực. `const idx = Math.max(0, chain.length - 1 - (TRUSTED_PROXY_HOPS - 1)); return chain[idx];`.' },
    { search: /admin_audit và cheat_flags có chứa user_id/g, replace: 'admin_audit và cheat_flags có chứa subject_hash' },
    { search: /7\. RESOLVED RISKS/g, replace: '8. RESOLVED RISKS' } // Fix numbering if needed
]);

// 2. Fix PWA Reject > 7 days
update('feature_offline_pwa.txt', [
    { search: /<= 7 ngày/g, replace: '<= 7 ngày (lưu ý: quá 7 ngày thì nhận với cờ offline_stale, KHÔNG reject)' },
    { search: /sắp quá hạn 7 ngày/g, replace: 'sắp quá hạn nhận XP' },
    { search: /kịp online đồng bộ/g, replace: 'kịp online đồng bộ để nhận XP' }
]);

// 3. Scoring (GAMMA + Trimmed Mean spec + CV return type)
update('feature_games_scoring.txt', [
    { search: /trung bình động lũy thừa hai chiều \(Bidirectional EMA\)/g, replace: 'Trung bình đã cắt xén (Robust Trimmed Mean)' },
    { search: /thuật toán EMA \(`applyRoundRating`\)/g, replace: 'thuật toán Trimmed Mean (`applyRoundRating`)' },
    { search: /THANG ĐIỂM VÀ TÍNH ĐIỂM ELO \/ RATING \(EMA MODEL\)/g, replace: 'THANG ĐIỂM VÀ TÍNH ĐIỂM ELO / RATING (TRIMMED MEAN MODEL)' },
    { search: /bằng công thức EMA/g, replace: 'bằng công thức Trimmed Mean' },
    { search: /quy tắc tính EMA/g, replace: 'quy tắc tính Trimmed Mean' },
    { search: /Focus: Đo độ ổn định nhịp độ.*/g, replace: "Focus: Đo độ ổn định nhịp độ (Coefficient of Variation - CV - Trả về `CvResult = { value: number, reliable: boolean }` để caller xử lý)." },
    { search: /focus = MAX \* diff \* 0\.92 \*.*/g, replace: "focus = clamp(RATING_MAX * Math.pow(quality, GAMMA[game]['focus']));" },
    { search: /speed = MAX \*.*/g, replace: "speed = clamp(RATING_MAX * Math.pow(quality, GAMMA[game]['speed']));" },
    { search: /cv\(rts\)/g, replace: "cv(rts).value" }
]);

// 4. AntiCheat CV
update('feature_anticheat_observability.txt', [
    { search: /cv\(xs\) sẽ tự động trả về `1\.0`.*/g, replace: "cv(xs) trả về `{value: NaN, reliable: false}` nếu N < 10. Không phạt metronomic nếu !reliable." }
]);

// 5. Admin (Achievement Stats Gen)
update('feature_admin.txt', [
    { search: /sync_achievements/g, replace: 'sync_achievements (Lưu ý: user_achievements cần có stats_generation để người dùng có thể cày lại sau khi admin reset)' }
]);

// 6. Dashboard (Provisional Merge)
update('feature_ui_dashboard.txt', [
    { search: /Cập nhật tạm Profile state/g, replace: 'Lưu vào provisionalRounds, KHÔNG merge vào Profile state' },
    { search: /biến động rating các trục/g, replace: 'biến động rating các trục (chỉ hiển thị nếu ranked === true)' },
    { search: /13/g, replace: '16' },
    { search: /IndexedDB/g, replace: 'localStorage' }
]);

// 7. Privacy
update('privacy-and-terms.md', [
    { search: /Exceptions apply for security logs \(90\/365 days\)/g, replace: 'Security logs (cheat_flags, admin_audit) will be pseudonymized using subject_hash to comply with GDPR erasure while maintaining anti-cheat efficacy.' }
]);

console.log("Docs fully synced with 8.0 review.");
