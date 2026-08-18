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

// Fix M9 False Positive in operations-dashboard.md
const fpReplacement = `-- Alias: fp_rate_random_sample
  *Ghi chú: Phải lấy dữ liệu review từ view \`effective_cheat_flag_review\` (chứa manual review append-only) thay vì \`cheat_flags\` gốc để đảm bảo tính bất biến của cheat flag.*
  \`\`\`sql
  SELECT
    count(c.id) filter (where c.review_status = 'false_positive')::numeric / nullif(count(c.id) filter (where c.review_status is not null), 0) * 100 as fp_rate_pct,
    count(c.id) filter (where c.review_status is null) as unreviewed
  FROM cheat_flag_review_queue q
  JOIN effective_cheat_flag_review c ON q.flag_id = c.id
  WHERE q.sampled_at > now() - interval '7 days';
  \`\`\``;

replaceRegex('docs/operations-dashboard.md', /-- Alias: fp_rate_random_sample[\s\S]+?WHERE q\.sampled_at > now\(\) - interval '7 days';\n  ```/, fpReplacement);

console.log("Done");
