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

// 1. feature_games_scoring.txt - Model B Ceilings
replaceRegex(
    'docs/feature_games_scoring.txt',
    /\*Ghi chú Cân bằng \(Calibration\)\*: Mọi trục điểm được cân chỉnh sao cho P50 = 500 điểm và mức hoàn hảo \(perfect play\) phải đạt tiệm cận TRẦN 1000 điểm.+?normalize xong\./,
    '*Ghi chú Cân bằng (Calibration)*: Mọi trục điểm được cân chỉnh sao cho P50 = 500 điểm. Áp dụng Mô hình B (Model B) cho Scoring Ceilings: Mức trần điểm số (MAX) không còn cố định 1000 cho mọi game, mà được quy định theo từng trò chơi cụ thể để phản ánh đúng mức độ khó (Ví dụ: Memory Matrix MAX=1050, Schulte MAX=1100, Math Sprint MAX=950). Các công thức hỗ trợ (như Stroop focus max 717) được giữ nguyên, nhưng sẽ tính theo tỷ lệ của MAX mới. Yêu cầu có `test:scoring-ceiling` tính toán trần của mỗi game.'
);

// 2. feature_games_scoring.txt - rating_model_version
replaceRegex(
    'docs/feature_games_scoring.txt',
    /\+ Từ Phase 12 \(Tuần 3\), `cognitive_index` được tính toán hoàn toàn trên Database \(qua DB function `compute_cognitive_index` và View `friend_leaderboard`\)\./,
    '+ Từ Phase 12 (Tuần 3), `cognitive_index` được tính toán hoàn toàn trên Database (qua DB function `compute_cognitive_index` và View `friend_leaderboard`). Điểm số được version hóa theo từng mùa giải (Epoch) thông qua `rating_model_version`, đảm bảo khi thay đổi công thức tính CI thì rank cũ không bị hỏng.'
);

// 3. feature_gamification_social.txt - Ceilings
replaceRegex(
    'docs/feature_gamification_social.txt',
    /\+ `score`: Thành tích điểm cao trong một ván[\s\S]+?Mental Rotation 700\/825\)\./,
    '+ `score`: Thành tích điểm cao trong một ván (Tính theo % của MAX: Đạt 82.5%, 92.5%, 99.0%, và 10 ván đạt 92.5% MAX theo Model B).\n  + `game`: Thành tích riêng của từng trò (Mốc 70% MAX / 82.5% MAX theo Model B, cộng thêm các mốc độ khó như Schulte 6x6, Sudoku Extreme, N-Back 5-Back).'
);
