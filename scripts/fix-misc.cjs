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
    'docs/known-issues.md',
    /\| \| KI-17 \| P3 \| Closed \|/g,
    '| KI-17 | P3 | Closed |'
);

replaceRegex(
    'docs/known-issues.md',
    /\| \| KI-20 \| P1 \| Closed \|/g,
    '| KI-20 | P1 | Closed |'
);

replaceRegex(
    'docs/feature_gamification_social.txt',
    /2\. `useEffect` kích hoạt `Cập nhật achievement qua outbox\/counter sau round, không syncAchievements\(\) trên mỗi mount để tránh tốn DB scan.` gọi yêu cầu RPC `sync_achievements` tới Supabase\./,
    '2. Client không còn chủ động gọi `syncAchievements()` trên mỗi mount để tránh tốn DB scan. Server sử dụng cơ chế event-driven thông qua Outbox và Counter sau mỗi ván chơi để tự động xét duyệt thành tựu.'
);
