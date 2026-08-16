const fs = require('fs');
for (const file of ['docs/observability.md', 'docs/monitoring-alerts.md']) {
  let doc = fs.readFileSync(file, 'utf8');
  doc = doc.replace(
    /CASE[\s\S]*?ELSE 2000[\s\S]*?END/i,
    'public.histogram_p95(count_le_100, count_le_300, count_le_500, count_le_800, count_le_2000, sum_requests)'
  );
  if (file.includes('monitoring-alerts.md')) {
    doc = doc.replace('Warning Threshold > 800ms', 'Target: p95 < 500ms\\n  - Warning Threshold > 800ms');
  }
  fs.writeFileSync(file, doc);
}
