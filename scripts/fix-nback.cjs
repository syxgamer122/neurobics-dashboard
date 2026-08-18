const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'docs/feature_games_scoring.txt');

let content = fs.readFileSync(file, 'utf8');

const regex = /6\. N-Back:[\s\S]+?Speed: `speed\(rts, 620, 0\.82\)`\./g;

const replacement = `6. N-Back:
   - Input: \`n\` (1-6), \`trials\`, \`hits\`, \`misses\`, \`falseAlarms\`, \`rts\`. Bắt buộc kiểm tra \`if (targets <= 0 || nonTargets <= 0)\` thì ném lỗi \`ValidationError("Invalid N-Back trial distribution")\`.
   - Sử dụng lý thuyết phát hiện tín hiệu (Signal Detection Theory): Tính d' (d-prime) thông qua hàm nghịch đảo phân phối chuẩn (inverse CDF). \`hitRate = correctedRate(hits, targets)\`, \`faRate = correctedRate(falseAlarms, nonTargets)\`. \`dPrime = invCDF(hitRate) - invCDF(faRate)\`. \`depth = clamp01(n / 6)\`.
   - Memory: \`clamp(MAX * CDF(dPrime) * (0.62 + 0.36 * depth))\`.
   - Focus: \`clamp(MAX * CDF(dPrime) * (0.62 + 0.32 * (1 - faRate)) * (0.72 + 0.26 * depth))\`.
   - Speed: \`speed(rts, 620, 0.82)\`.`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log('Success');
} else {
    console.log('Not found');
}
