const fs = require("fs");
const path = require("path");

const DOCS_DIR = "c:/Users/huumanh/Downloads/neurobics/Neurobics Dashboard Design (10)/docs";

function replaceInFile(filename, replacements) {
    const filePath = path.join(DOCS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    let content = fs.readFileSync(filePath, "utf-8");
    let modified = false;

    for (const [search, replace] of replacements) {
        if (typeof search === 'string') {
            if (content.includes(search)) {
                content = content.replace(search, replace);
                modified = true;
            } else {
                console.error(`String not found in ${filename}: ${search.substring(0, 50)}...`);
            }
        } else { // RegExp
            if (search.test(content)) {
                content = content.replace(search, replace);
                modified = true;
            } else {
                console.error(`Regex not found in ${filename}: ${search}`);
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`Updated ${filename}`);
    }
}

// feature_games_scoring.txt M11, M14, N-Back d', Mental Rotation
replaceInFile("feature_games_scoring.txt", [
    [
        `- Server đóng vé cũ chưa nộp (nếu có) và cấp phát vé mới`,
        `- Hỗ trợ tối đa 3 vé (ticket) chưa nộp (active) cùng lúc (được phân biệt bằng \`client_session_id\`). Vé cũ thứ 4 mới bị đóng. Cấp phát vé mới`
    ],
    [
        `+ Chạy \`assertCountBounds\` & \`assertRtBounds\` (chặn RT < 80ms hoặc RT > 60s).`,
        `+ Chạy \`assertCountBounds\` & \`assertRtBounds\` (chặn RT < 80ms; nếu RT > 60s phải có \`pauseDurationMs\` được báo cáo từ client, loại bỏ các \`trial\` bị pause khỏi tính toán). \`clientElapsedMs\` phải được gửi lên ở dạng số nguyên (\`Math.round()\`).`
    ],
    [
        `7. Math Sprint:`,
        `*Ghi chú Cân bằng (Calibration)*: Mỗi trục điểm được căn chỉnh (calibrate) sao cho P50 của dân số toàn cầu tương đương mốc 500 điểm. Tránh dùng hệ số Focus < 1 quá nhiều khiến điểm bị nén (compression) quanh mốc thấp. Percentile thật sự phải được nội suy từ histogram phân phối, không dùng hàm lỗi Erf xấp xỉ.\n\n7. Math Sprint:`
    ],
    [
        `   - \`hitRate = hits / targets\`, \`faRate = clamp01(falseAlarms / nonTargets)\`, \`accuracy = clamp01(hitRate - faRate * 0.95)\`. \`depth = clamp01(n / 6)\`.`,
        `   - Sử dụng lý thuyết phát hiện tín hiệu (Signal Detection Theory): Tính d' (d-prime) thay vì phép trừ tuyến tính. \`hitRate = clamp(hits / targets, 0.01, 0.99)\`, \`faRate = clamp(falseAlarms / nonTargets, 0.01, 0.99)\`. \`depth = clamp01(n / 6)\`.`
    ],
    [
        `   - \`radians = angleDegrees * Math.PI / 180\`, \`angleLoad = Math.abs(Math.sin(radians / 2))\`. Tính trung bình \`angleLoad\` của các câu đúng. \`angleFactor = 0.78 + 0.24 * meanAngleLoad\`.`,
        `   - Tính độ dốc (Slope) RT theo góc xoay (theo chuẩn Shepard-Metzler) thay vì chỉ dùng thời gian trung bình, nhằm chặn hành vi bấm bừa tốc độ cao.`
    ]
]);

// feature_anticheat_observability.txt M12-M13
replaceInFile("feature_anticheat_observability.txt", [
    [
        `Client gọi \`fetch(".../server/telemetry", { keepalive: true })\`.`,
        `Client gọi \`fetch(".../server/telemetry", { keepalive: true })\`. Log từ client không được redact xoá các trường số (như \`duration\`, \`ms\`), chỉ redact giá trị của các PII keys đã biết.`
    ],
    [
        `1. Rate Limiting: Khai báo \`createRateLimiter({ limit: 60, windowMs: 60_000 })\`. Giới hạn tối đa 60 request / 1 phút / 1 địa chỉ IP (\`x-forwarded-for\`).`,
        `1. Rate Limiting: Khai báo \`createRateLimiter({ limit: 60, windowMs: 60_000 })\`. Lấy \`clientIp()\` từ mảng IP đầy đủ. Nếu IP là unknown hoặc untrusted, bắt buộc yêu cầu Turnstile payload hợp lệ.`
    ]
]);

// version-policy.md Nits
replaceInFile("version-policy.md", [
    [
        `\`INSPECTOR_VERSIONS\`:\n  - Quản lý phiên bản cho logic của \`inspectRound()\` (Anti-cheat) cho từng game riêng biệt.`,
        `\`CONFIG_VERSIONS\`:\n  - Quản lý phiên bản JSON cấu hình thông số độ khó và giới hạn game. (Nếu thay đổi cấu trúc config thì phải tăng số này).\n\n\`INSPECTOR_VERSIONS\`:\n  - Quản lý phiên bản cho logic của \`inspectRound()\` (Anti-cheat) cho từng game riêng biệt.`
    ]
]);

// feature_games_scoring.txt Client Brain Age removal
replaceInFile("feature_games_scoring.txt", [
    [
        `18. TÍNH CHỈ SỐ NHẬN THỨC VÀ TUỔI NÃO (COGNITIVE INDEX & BRAIN AGE)`,
        `4.4. TÍNH CHỈ SỐ NHẬN THỨC VÀ TUỔI NÃO (COGNITIVE INDEX & BRAIN AGE)`
    ],
    [
        `Client vẫn có calcBrainAge`, // If this exists
        ``
    ]
]);

// fix known issues formatting
const knownIssuesContent = fs.readFileSync(path.join(DOCS_DIR, "known-issues.md"), "utf8");
let newKi = knownIssuesContent.replace(/\| runbook\.md \| runbook\.md \|/g, "| runbook.md | |");
// add missing columns
if (!newKi.includes("PR/Commit")) {
    newKi = newKi.replace(/\| Issue ID \| Type \| Status \| Priority \| Description \|/, "| Issue ID | Type | Status | Priority | Description | PR/Commit | Regression Test |");
    newKi = newKi.replace(/\|----------\|------\|--------\|----------\|-------------\|/, "|----------|------|--------|----------|-------------|-----------|-----------------|");
}
fs.writeFileSync(path.join(DOCS_DIR, "known-issues.md"), newKi);

// fix RPO in known-issues.md
replaceInFile("known-issues.md", [
    [
        `RPO < 1h`,
        `RPO < 24h`
    ]
]);

console.log("Minor fixes completed");
