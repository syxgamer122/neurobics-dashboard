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

// 1. claim_round in feature_anticheat_observability.txt
replaceRegex(
    'docs/feature_anticheat_observability.txt',
    /UPDATE round_tickets SET state = 'processing', processing_token = gen_random_uuid\(\), processing_started_at = clock_timestamp\(\) WHERE id = p_round_id AND user_id = auth\.uid\(\) AND state = 'issued' AND expires_at > clock_timestamp\(\) RETURNING \*/,
    "UPDATE round_tickets SET state = 'processing', processing_token = gen_random_uuid(), processing_started_at = clock_timestamp() WHERE id = p_round_id AND user_id = auth.uid() AND state = 'activated' AND submit_deadline > clock_timestamp() RETURNING *"
);

// 2. Cron job in feature_anticheat_observability.txt
replaceRegex(
    'docs/feature_anticheat_observability.txt',
    /UPDATE round_tickets SET state = 'issued', processing_token = NULL, attempt_count = attempt_count \+ 1 WHERE state = 'processing' AND processing_started_at < now\(\) - interval '2 minutes'/,
    "UPDATE round_tickets SET attempt_count = attempt_count + 1, state = CASE WHEN attempt_count + 1 >= 3 THEN 'failed' ELSE 'activated' END, processing_token = NULL, processing_started_at = NULL, active_slot = CASE WHEN attempt_count + 1 >= 3 THEN NULL ELSE active_slot END WHERE state = 'processing' AND processing_started_at < now() - interval '2 minutes'"
);

// 3. active_slot index in feature_games_scoring.txt
replaceRegex(
    'docs/feature_games_scoring.txt',
    /UNIQUE INDEX round_ticket_active_slot_uidx ON public\.round_tickets \(user_id, active_slot\) WHERE state IN \('issued', 'processing'\)/,
    "UNIQUE INDEX round_ticket_active_slot_uidx ON public.round_tickets (user_id, active_slot) WHERE state IN ('issued', 'activated', 'processing')"
);

// 4. Ticket activation in feature_games_scoring.txt
replaceRegex(
    'docs/feature_games_scoring.txt',
    /- Khi người dùng bấm Play, client gọi `\/server\/activate-round` để nhận `publicChallenge` và `submit_deadline` \(TTL cực ngắn tùy độ dài game\)\. Challenge tinh được reveal tại thời điểm này\./,
    "- Khi người dùng bấm Play, client gọi `/server/activate-round` để nhận `publicChallenge` và `submit_deadline` (TTL cực ngắn tùy độ dài game). Activation phải nguyên tử và idempotent (UPDATE state = 'activated', activated_at = clock_timestamp(), submit_deadline = clock_timestamp() + p_game_duration WHERE state = 'issued' AND expires_at > clock_timestamp()). Nếu retry, trả lại cùng challenge, không gia hạn deadline. Challenge tinh chỉ được reveal tại thời điểm này."
);

console.log("Done");
