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
    'docs/feature_games_scoring.txt',
    /\*Ghi chú[\s\S]+?khi normalize xong\./,
    '*Ghi chú Cân bằng (Calibration)*: Mọi trục điểm được cân chỉnh sao cho P50 = 500 điểm. Áp dụng Mô hình B (Model B) cho Scoring Ceilings: Mức trần điểm số (MAX) không còn cố định 1000 cho mọi game, mà được quy định theo từng trò chơi cụ thể để phản ánh đúng mức độ khó (Ví dụ: Memory Matrix MAX=1050, Schulte MAX=1100, Math Sprint MAX=950). Các công thức hỗ trợ (như Stroop focus max 717) được giữ nguyên, nhưng sẽ tính theo tỷ lệ của MAX mới. Yêu cầu có `test:scoring-ceiling` tính toán trần của mỗi game.'
);
