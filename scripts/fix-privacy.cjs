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

replaceRegex(
    'docs/privacy-and-terms.md',
    /\| Chơi game \| Telemetry \| Hợp đồng \| Vĩnh viễn \| N\/A \|/,
    '| Chơi game | Điểm số (training_sessions) | Hợp đồng | Vĩnh viễn | N/A |\n| Chơi game | Dữ liệu gốc (raw_telemetry) | Lợi ích hợp pháp | 180 ngày | N/A |'
);

replaceRegex(
    'docs/privacy-and-terms.md',
    /UI\/Zod validate \\`birth_date <= currentDate - 16 years\\`, DB trigger chặn ngày sinh thực tế\. Chỉ dựa trên năm sinh là không đủ để bảo vệ chính xác\)\. Các tài khoản hiện tại có \\`birth_year\\` không rõ ngày sẽ áp dụng quy tắc bảo thủ \(conservative rule: tính sinh vào ngày 31\/12\)/,
    'UI/Zod validate `birth_date <= currentDate - 16 years`, DB trigger chặn ngày sinh thực tế. Yêu cầu nhập chính xác `birth_date` thay vì chỉ `birth_year`. Các tài khoản cũ chỉ có `birth_year` sẽ tự động áp dụng quy tắc bảo thủ (tính sinh vào ngày 31/12 của năm đó)'
);
