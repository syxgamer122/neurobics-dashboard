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

// 2. M6 in feature_gamification_social.txt (Achievement versioning)
replaceRegex(
    'docs/feature_gamification_social.txt',
    /\+ `score`: Thành tích điểm cao trong một ván \(Tính theo % của MAX: Đạt 82\.5%, 92\.5%, 99\.0%, và 10 ván đạt 92\.5% MAX theo Model B\)\./,
    "+ `score`: Thành tích điểm cao trong một ván (Tính theo % của MAX: Đạt 82.5%, 92.5%, 99.0%, và 10 ván đạt 92.5% MAX theo Model B). Mỗi achievement unlock lưu lại `normalized`, `attainable_ceiling`, `scorer_version`, `calibration_version`, `achievement_rule_version`, `source_session_id`, `unlocked_at` để bảo toàn tính nguyên vẹn không rescore."
);

// 3. M8 in feature_gamification_social.txt (Practice Contract)
const practiceContract = `  4. Ưu tiên 4: Fallback chuỗi an toàn "Nhiệm vụ" (tiếng Việt) hoặc "Quest" (tiếng Anh).

  5. Hợp đồng Eligibility (Practice Contract):
     + Online ranked: Rating=Có, XP=Có, Quest=Có, Streak=Có, Achievement điểm cao=Có
     + Accessible practice: Rating=Không, XP=Giới hạn, Quest=Có tùy quest, Streak=Có, Achievement điểm cao=Không
     + Offline recent: Rating=Không, XP=Giới hạn, Quest=Không hoặc giới hạn, Streak=Theo received date, Achievement=Không
     + Offline stale: Rating=Không, XP=Không, Quest=Không, Streak=Không, Achievement=Không`;
replaceRegex(
    'docs/feature_gamification_social.txt',
    /4\. Ưu tiên 4: Fallback chuỗi an toàn "Nhiệm vụ" \(tiếng Việt\) hoặc "Quest" \(tiếng Anh\)\./,
    practiceContract
);

console.log("Done");
