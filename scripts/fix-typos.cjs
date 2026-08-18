const fs = require('fs');
const path = require('path');

function replaceRegex(filepath, targetRegex, replacement) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (content.match(targetRegex)) {
        content = content.replace(targetRegex, replacement);
        fs.writeFileSync(filepath, content);
        console.log('Success ' + filepath);
    } else {
        console.log('Not found in ' + filepath);
    }
}

// 1. Fix birth_year in feature_auth_profile.txt
replaceRegex('docs/feature_auth_profile.txt', /nam sinh \(birth_year\)/g, 'ngày sinh chính xác (birth_date)');
replaceRegex('docs/feature_auth_profile.txt', /update_my_birth_date\(birthYear\)/g, 'update_my_birth_date(birthDate)');
replaceRegex('docs/feature_auth_profile.txt', /cột `birth_year`/g, 'cột `birth_date`');
replaceRegex('docs/feature_auth_profile.txt', /submitBirthYear\(\) validate nam sinh nằm trong khoảng từ `1900` đến `năm hiện tại - 16`/g, 'submitBirthDate() gửi ngày sinh chính xác để server verify đủ 16 tuổi');
replaceRegex('docs/feature_auth_profile.txt', /như `birth_year`/g, 'như `birth_date`');
replaceRegex('docs/feature_auth_profile.txt', /update_my_birth_year\(\)/g, 'update_my_birth_date()');
replaceRegex('docs/feature_auth_profile.txt', /cộng `birth_year` < 16 tuổi/g, 'chặn `birth_date` < 16 tuổi');
replaceRegex('docs/feature_auth_profile.txt', /G\. NAM SINH \(BIRTH YEAR\)/, 'G. NGÀY SINH (BIRTH DATE)');

// 2. Fix typos in feature_auth_profile.txt
replaceRegex('docs/feature_auth_profile.txt', /\(xem ADR-0009\)\. \(xem ADR-0009\)/g, '(xem ADR-0009).');
replaceRegex('docs/feature_auth_profile.txt', /requireAdmin\(c\) có hiệu lực\. requireAdmin\(c\) có hiệu lực\./g, 'requireAdmin(c) có hiệu lực.');

// 3. Fix typos in feature_ui_dashboard.txt
replaceRegex('docs/feature_ui_dashboard.txt', /lưu vào `localStorage` thay vì `localStorage`/g, 'lưu vào `localStorage` thay vì React State');

// 4. Fix typos in feature_gamification_social.txt
replaceRegex('docs/feature_gamification_social.txt', /sync_achievements \(\.\.\.\)_for bị chèn hỏng/g, 'sync_achievements');
replaceRegex('docs/feature_gamification_social.txt', /Mental Rotation 19/g, 'Mental Rotation');

// 5. Fix typos in feature_games_scoring.txt
replaceRegex('docs/feature_games_scoring.txt', /TÍNH ĐIỂM ELO \/ RATING/g, 'TÍNH ĐIỂM RATING');
replaceRegex('docs/feature_games_scoring.txt', /Server CognitiveSummary/g, 'CognitiveSummary');

console.log("Done");
