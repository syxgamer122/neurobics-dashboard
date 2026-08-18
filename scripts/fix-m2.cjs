const fs = require('fs');

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

// 1. M2 & M6: RoundEngineManifest & SUPPORTED_TELEMETRY_VERSIONS
const manifestSection = `## 1. Bản kê khai Động cơ (Round Engine Manifest)

Để đảm bảo khả năng tái lập (reproducibility) tuyệt đối cho mỗi ván chơi (ngoại trừ offline practice), hệ thống sử dụng một \`RoundEngineManifest\` ghim chặt toàn bộ logic tạo ra kết quả.

\`\`\`typescript
type RoundEngineManifest = DeepReadonly<{
  scorerVersion: number;
  gameInspectorVersion: number;
  sharedInspectorVersion: number;
  telemetrySchemaVersion: number;
  configVersion: number;

  ratingModelVersion: number;
  calibrationVersion: number;
  xpPolicyVersion: number;
  challengeGeneratorVersion: number;

  inspectorRuleSetHash: \`sha256:\${string}\`;
  artifactSha256: \`sha256:\${string}\`;
}>;
\`\`\`
Mỗi ván chơi sẽ lưu trữ \`engine_manifest_hash\` trên \`round_tickets\` và \`training_sessions\`, đồng thời lưu trữ các version riêng lẻ dưới dạng cột để tối ưu hóa việc query. Calibration nếu luôn đóng gói cứng trong Scorer có thể gộp chung vào \`scorerVersion\`.

### Support Window (Offline & Migration)
Server hỗ trợ tương thích ngược (backward compatibility) thông qua hằng số khai báo tường minh bằng dữ liệu:
\`\`\`typescript
export const SUPPORTED_TELEMETRY_VERSIONS = {
  schulte: new Set([3, 2, 1]),
  nback: new Set([2, 1]),
};
\`\`\`
Quy định vòng đời dữ liệu cũ:
- **0–7 ngày**: practice recent, có capped reward.
- **8–30 ngày**: stale, không XP/quest/streak.
- **>30 ngày**: chuyển dead-letter, cho export/xóa, không xử lý tự động.
Runtime chỉ được loại bỏ implementation cũ khi:
- Không còn non-terminal ticket tham chiếu.
- Đã qua thời hạn support >30 ngày.
- Không còn client build được hỗ trợ cần adapter đó.

## 2. Khi nào bump – Bảng tra nhanh (Bump Matrix)

| Thay đổi | Hành động |
| --- | --- |
| Thêm game mới | Khởi tạo scorer/inspector/schema/config ở version 1 (Không bump game cũ) |
| Đổi công thức điểm | Bump scorer |
| Đổi cách cập rolling rating | Bump rating model |
| Đổi calibration | Bump calibration hoặc scorer (nếu đóng gói chung) |
| Đổi XP | Bump XP policy |
| Đổi challenge generation | Bump challenge generator |
| Đổi giá trị difficulty/targets/speed | Bump config |
| Đổi threshold hoặc severity | Bump inspector/policy và tạo rule-set hash mới |
| Refactor được chứng minh bit-identical | KHÔNG bump |

**Nguyên tắc:** Chỉ bump khi **kết quả quan sát được** (điểm số, cheat flag, shape của payload) thay đổi. Refactor nội bộ không bump.
`;

replaceRegex('docs/version-policy.md', /## 1\. N[\s\S]+?Refactor noi bo khong bump\./, manifestSection);

console.log("Done M2/M6");
