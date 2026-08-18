const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'docs/feature_offline_pwa.txt');

let content = fs.readFileSync(file, 'utf8');

const regex = /if \(result\.status === "ok" \|\| result\.status === "duplicate" \|\| result\.status === "rejected"\) \{\s*await deleteRound\(result\.clientRoundId\);\s*\} else \{\s*await scheduleRetry\(result\.clientRoundId\); \/\/ Exponential backoff \+ jitter\s*\}/g;

const replacement = `if (result.terminal) {
          if (result.status === "unsupported_schema") {
            await moveToDeadLetter(result.clientRoundId); // Phiên bản quá cũ, chuyển sang lưu trữ chết để debug
          } else {
            await deleteRound(result.clientRoundId);
          }
        } else {
          await scheduleRetry(result.clientRoundId); // Exponential backoff + jitter
        }`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log('Success');
} else {
    console.log('Not found');
}
