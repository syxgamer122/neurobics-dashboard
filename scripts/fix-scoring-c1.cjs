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

const scaleText = `
- Thang điểm chuẩn: \`SCORE_SCALE_MAX = 1000\`.
  - Phân tách điểm số: Hệ thống sử dụng cấu trúc \`ScoredRound\` để lưu trữ rõ ràng:
    + \`rawHeadline\`, \`rawAxes\`: Điểm thô thực tế có thể vượt 1000 (tuỳ vào MAX của game). Chỉ phục vụ phân tích.
    + \`normalizedHeadline\`, \`normalizedAxes\`: Điểm chuẩn hoá về thang 1000 (\`Math.round(SCORE_SCALE_MAX * Math.min(1, Math.max(0, raw / attainableCeiling)))\`).
    + Mọi DB projection, rating, Cognitive Index, XP, leaderboard ĐỀU PHẢI dùng \`normalizedHeadline\` / \`normalizedAxes\`.
  - Chữa lành dữ liệu cũ (Auto-heal): \`sanitizeRating(val)\``;

replaceRegex(
    'docs/feature_games_scoring.txt',
    /- Thang điểm chuẩn: `RATING_MIN = 0`, `RATING_MAX = 1000`\.\s+- Chữa lành dữ liệu cũ \(Auto-heal\): `sanitizeRating\(val\)`/,
    scaleText
);

replaceRegex(
    'docs/feature_games_scoring.txt',
    /\+ `base = 15`, `perf = \(score \/ 1000\) \* 45` \(tối đa 60 XP\/ván\)\./,
    '+ `base = 15`, `perf = (normalizedHeadline / SCORE_SCALE_MAX) * 45` (tối đa 60 XP/ván).'
);

replaceRegex(
    'docs/feature_games_scoring.txt',
    /11\. `supabase\/functions\/_shared\/scoring\/core\.ts`[\s\S]+?12\. `supabase\/functions\/_shared\/scoring\/standard-games\.ts`/,
    '11. `supabase/functions/_shared/scoring/core.ts`\n    - Thư viện nguyên thủy chấm điểm server: định nghĩa `Telemetry`, `ScoredRound` (chứa rawAxes, normalizedAxes, rawHeadline, normalizedHeadline, scoringModelVersion, calibrationVersion), các hàm toán học (`speed`, `focus`, `headline`, `median`, `cv`, `statSamples`, `clamp`).\n12. `supabase/functions/_shared/scoring/standard-games.ts`'
);

replaceRegex(
    'docs/feature_games_scoring.txt',
    /Tính d' \(d-prime\) thông qua hàm nghịch đảo phân phối chuẩn \(inverse CDF\)[\s\S]+?- Memory: `clamp\(MAX \* CDF\(dPrime\)/,
    'Sử dụng lý thuyết phát hiện tín hiệu (Signal Detection Theory): Tính d\' (d-prime) thông qua hàm nghịch đảo phân phối chuẩn (inverse CDF). `hitRate = correctedRate(hits, targets)`, `faRate = correctedRate(falseAlarms, nonTargets)`. `dPrime = invCDF(hitRate) - invCDF(faRate)`. `depth = clamp01(n / 6)`.\n   - Áp dụng Calibration Version hóa: Tính xác suất thực tế qua hàm logistic `calibrateDPrime(dPrime, {slope, midpoint})` với các tham số fitted từ dữ liệu thực.\n   - Memory: `clamp(MAX * calibrateDPrime(dPrime) *`'
);

replaceRegex(
    'docs/feature_games_scoring.txt',
    /- Focus: `clamp\(MAX \* CDF\(dPrime\)/,
    '- Focus: `clamp(MAX * calibrateDPrime(dPrime)'
);

console.log("Done");
