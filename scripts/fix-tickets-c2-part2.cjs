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
    /- Khi người dùng bấm Play, client gọi `\/server\/activate-round` để nhận `publicChallenge` và `submit_deadline` \(TTL cực ngắn tùy độ dài game\)\. Challenge tinh được reveal tại thời điểm này\./,
    "- Khi người dùng bấm Play, client gọi `/server/activate-round` để nhận `publicChallenge` và `submit_deadline` (TTL cực ngắn tùy độ dài game). Activation phải nguyên tử và idempotent (UPDATE state = 'activated', activated_at = clock_timestamp(), submit_deadline = clock_timestamp() + p_game_duration WHERE state = 'issued' AND expires_at > clock_timestamp()). Nếu retry, trả lại cùng challenge, không gia hạn deadline. Challenge tinh chỉ được reveal tại thời điểm này."
);

// Fallback in case of encoding issue
replaceRegex(
    'docs/feature_games_scoring.txt',
    /- Khi ng[\s\S]+?Challenge tinh d[\s\S]+?thời điểm này\./,
    "- Khi người dùng bấm Play, client gọi `/server/activate-round` để nhận `publicChallenge` và `submit_deadline` (TTL cực ngắn tùy độ dài game). Activation phải nguyên tử và idempotent (UPDATE state = 'activated', activated_at = clock_timestamp(), submit_deadline = clock_timestamp() + p_game_duration WHERE state = 'issued' AND expires_at > clock_timestamp()). Nếu retry, trả lại cùng challenge, không gia hạn deadline. Challenge tinh chỉ được reveal tại thời điểm này."
);

console.log("Done");
