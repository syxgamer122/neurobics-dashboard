const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'docs/feature_games_scoring.txt');

let content = fs.readFileSync(file, 'utf8');

const regex = /\[BƯỚC 3: NỘP VÁN CHƠI & CHẤM ĐIỂM SERVER\][\s\S]+?Trimmed Mean\./g;

const replacement = `[BƯỚC 3: NỘP VÁN CHƠI & CHẤM ĐIỂM SERVER]
Người dùng hoàn thành ván -> Game gọi handler nộp dữ liệu -> \`submitRound(roundId, game, telemetry)\`
  ├─► Client gửi POST /server/submit-round { roundId, game, telemetry, fingerprint }
  ├─► Server sử dụng RPC \`claim_round\` để khóa atomic và cấp \`processing_token\`.
  ├─► Server tính thời gian trôi qua thực tế: \`serverElapsedMs = Date.now() - ticket.activated_at\`. (Chỉ dùng làm upper bound, không dùng để chấm điểm).
  ├─► Lớp chống gian lận \`inspectRound(ticket.game, telemetry, serverElapsedMs)\` (Sử dụng version lưu trên ticket: \`resolveScorer(ticket.scorerVersion)\`):
     + Schema validation -> Invariant validation -> Signal extraction.
     + Centralized Decision Engine nhận tín hiệu và quyết định:
        * Nếu HARD SIGNAL -> Dừng chấm điểm, gọi RPC \`finalize_rejected_round_tx\`.
        * Nếu SOFT SIGNAL -> Ghi cờ và vẫn tiếp tục chấm điểm.
  ├─► Lớp Validate & Scoring \`scoreAndValidate(ticket.game, telemetry, serverElapsedMs)\`:
     + Chặn các giá trị NaN, âm, hoặc sai kiểu. (Không còn hard reject tại mức này, chỉ trả tín hiệu suspicious).
     + Lọc bỏ các sample nhiễu.
     + Gọi Scorer tương ứng bằng \`resolveScorer(ticket.scorerVersion)\` để tính điểm các trục.
  └─► Kết thúc bằng duy nhất \`finalize_accepted_round_tx\` nếu thành công. Trả về \`CognitiveSummary\`.`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log('Success');
} else {
    console.log('Not found');
}
