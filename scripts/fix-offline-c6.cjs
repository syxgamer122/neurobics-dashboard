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

// 1. M4 & M5 in feature_offline_pwa.txt
replaceRegex(
    'docs/feature_offline_pwa.txt',
    /Số lượng ván tối đa lưu giữ trong hàng đợi local \(FIFO\)\./,
    "Số lượng ván tối đa lưu giữ trong hàng đợi local (Bounded persistent queue, capacity 200)."
);

replaceRegex(
    'docs/feature_offline_pwa.txt',
    /- `MAX_OFFLINE_AGE_MS`: Cập nhật logic: Nếu ván cũ hơn 7 ngày, hệ thống VẪN NHẬN để lưu lịch sử, nhưng gắn cờ `provenance = 'offline_stale'`, cho `XP = 0`\. KHÔNG REJECT để tránh mất ván của người chơi\. Compat window để xoá code dựa hoàn toàn vào việc version gửi lên có cũ hơn 2 bản so với `telemetrySchemaVersion` hay không \(quá cũ -> 426\)\./,
    "- `MAX_OFFLINE_AGE_MS`: Ván cũ hơn 7 ngày gắn cờ `provenance = 'offline_stale'`, bắt buộc `ranked=false, xp_eligible=false, quest_eligible=false, streak_eligible=false`. Offline Queue khi nhận response thiếu batch item phải tự động `scheduleRetry(clientRoundId, 'missing_server_result')`. Dead-letter queue phải có Export/Xóa UX cho dữ liệu `unsupported_schema`."
);

// 2. M6 in feature_gamification_social.txt (Achievement versioning)
replaceRegex(
    'docs/feature_gamification_social.txt',
    /Dựa vào ngưỡng tỷ lệ MAX \(ví dụ 82\.5% MAX của trò chơi\)\./,
    "Dựa vào ngưỡng tỷ lệ MAX. Mỗi achievement unlock lưu lại `normalized`, `attainable_ceiling`, `scorer_version`, `calibration_version`, `achievement_rule_version`, `source_session_id`, `unlocked_at` để bảo toàn tính nguyên vẹn không rescore."
);

// 3. M8 in feature_gamification_social.txt (Practice Contract)
const practiceContract = `   - Hợp đồng Eligibility:
     + Online ranked: Rating=Có, XP=Có, Quest=Có, Streak=Có, Achievement điểm cao=Có
     + Accessible practice: Rating=Không, XP=Giới hạn, Quest=Có tùy quest, Streak=Có, Achievement điểm cao=Không
     + Offline recent: Rating=Không, XP=Giới hạn, Quest=Không hoặc giới hạn, Streak=Theo received date, Achievement=Không
     + Offline stale: Rating=Không, XP=Không, Quest=Không, Streak=Không, Achievement=Không
   - `;
replaceRegex(
    'docs/feature_gamification_social.txt',
    /   - Tiền tố `play_` -> "Chơi 1 ván bất kỳ" \/ "Play 1 round" \n/,
    practiceContract + "Tiền tố `play_` -> \"Chơi 1 ván bất kỳ\" / \"Play 1 round\" \n"
);

// 4. M9 in privacy-and-terms.md (Cron B 180 days)
replaceRegex(
    'docs/data-retention.md',
    /Xóa sau 30 ngày/,
    "Xóa sau 180 ngày nếu tài khoản Guest đã có training/practice session (và không dính legal hold)"
);

replaceRegex(
    'docs/privacy-and-terms.md',
    /30 days/,
    "180 days"
);

console.log("Done");
