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

const registryReplacement = `### SCORERS_BY_VERSION (Per-scorer Versioning)

Bump version của TỪNG GAME CỤ THỂ khi thay đổi bất kỳ thành phần nào ảnh hưởng kết quả scoring của riêng game đó.

**Quy tắc "Implementation Registry":**
Server không chỉ lưu lại Hash hay Version số nguyên mà phải trỏ tới các hàm xử lý mã nguồn tồn tại vĩnh viễn (Immutable).
\`\`\`typescript
const SCORERS_BY_VERSION: Readonly<Record<GameId, Record<number, ScorerFunction>>> = {
  schulte: {
    1: schulteScorerV1,
    2: schulteScorerV2,
  }
};
\`\`\`
Đồng thời phải có Assertion trong CI để đảm bảo cấu hình luôn trỏ tới phiên bản tồn tại:
\`\`\`typescript
for (const game of GAME_IDS) {
  const version = CURRENT_SCORER_VERSIONS[game];
  expect(SCORERS_BY_VERSION[game][version]).toBeDefined();
}
\`\`\`

### INSPECTOR_RULE_SETS_BY_HASH
Tương tự Scorer, các rule set tĩnh cũng phải được lưu giữ vĩnh viễn theo mã Hash để khi xem lại \`inspector_rule_set_hash\` trên 1 ticket cũ, Server có thể tải đúng tập luật đã dùng ngày hôm đó:
\`\`\`typescript
const INSPECTOR_RULE_SETS_BY_HASH: Readonly<Record<string, InspectorRuleSet>> = {
  "sha256:...": inspectorRuleSetV1,
};
\`\`\`
Không được sửa đổi nội dung \`inspectorRuleSetV1\`. Nếu cần thay đổi, tạo \`V2\` và đổi hash.`;

replaceRegex(
    'docs/version-policy.md',
    /### SCORERS_BY_VERSION \(Per-scorer Versioning\)[\s\S]+?ý nghĩa\./,
    registryReplacement
);

console.log("Done");
