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
    'docs/monitoring-alerts.md',
    /FROM round_tickets WHERE created_at > now\(\) - interval '7 days';/,
    "FROM round_tickets WHERE finalized_at > now() - interval '7 days';"
);

replaceRegex(
    'docs/monitoring-alerts.md',
    /SELECT successes \* 100\.0 \/ NULLIF\(eligible, 0\) AS success_rate_pct\n-- Bổ sung SLI 2: round_acceptance_rate = accepted\/\(accepted\+rejected\+5xx\)\nFROM metric;/,
    "SELECT successes * 100.0 / NULLIF(eligible, 0) AS system_availability_pct\nFROM metric;\n\n-- SLI 2: Round Acceptance Rate (tính từ round_tickets)\n-- SELECT count(*) FILTER (WHERE state='accepted') / NULLIF(count(*), 0) FROM round_tickets WHERE finalized_at > now() - interval '7 days';"
);
