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

// 2. M6 in feature_gamification_social.txt (Achievement versioning) - with more permissive regex
replaceRegex(
    'docs/feature_gamification_social.txt',
    /\+ `score`: Thành tích điểm cao trong một ván \(Tính theo % của MAX: Đạt 82\.5%, 92\.5%, 99\.0%, và 10 ván đạt 92\.5% MAX theo Model B\)\./,
    "+ `score`: Thành tích điểm cao trong một ván (Tính theo % của MAX: Đạt 82.5%, 92.5%, 99.0%, và 10 ván đạt 92.5% MAX theo Model B). Mỗi achievement unlock lưu lại `normalized`, `attainable_ceiling`, `scorer_version`, `calibration_version`, `achievement_rule_version`, `source_session_id`, `unlocked_at` để bảo toàn tính nguyên vẹn không rescore."
);
replaceRegex(
    'docs/feature_gamification_social.txt',
    /\+ `score`: Th[\s\S]+?MAX theo Model B\)\./,
    "+ `score`: Thành tích điểm cao trong một ván (Tính theo % của MAX: Đạt 82.5%, 92.5%, 99.0%, và 10 ván đạt 92.5% MAX theo Model B). Mỗi achievement unlock lưu lại `normalized`, `attainable_ceiling`, `scorer_version`, `calibration_version`, `achievement_rule_version`, `source_session_id`, `unlocked_at` để bảo toàn tính nguyên vẹn không rescore."
);

// M11 in observability.md
const observabilityReplacement = `Server phải tự sinh \`canonical_request_id\` để đảm bảo tính duy nhất. \`x-trace-id\` từ client chỉ được xem là metadata không đáng tin cậy (\`untrusted\`), phải được validate định dạng UUID và giới hạn chiều dài để tránh cardinality abuse. \`setObservabilityUser(id)\` sẽ bị loại bỏ hoặc tự động trích xuất từ \`auth.uid()\`. UUID redaction phải nhận thức được field name để không redacts mất \`request_id\` và \`trace_id\`. \`Edge background write\` phải dùng cơ chế \`waitUntil\` để không bị runtime terminate.`;
replaceRegex(
    'docs/observability.md',
    /- Client s[\s\S]+?request_id và trace_id\./,
    observabilityReplacement
);

console.log("Done");
