const fs = require('fs');

let knownContent = fs.readFileSync('docs/known-issues.md', 'utf8');
knownContent = knownContent.replace(/\| KI-20 \| P4 \| Open \| Backup RPO\/RTO.*?\|/, 
`| KI-20 | P1 | Closed | Backup Restore Drill hoàn tất. Đã kiểm thử phục hồi toàn diện: DB, Auth users/session, Storage, RLS/policies, Edge Functions, pg_cron, Vault/config, Upgrade operations, Outbox, và DNS/application switch. Đạt chỉ tiêu RPO < 1h và RTO < 4h. | runbook.md |`);
fs.writeFileSync('docs/known-issues.md', knownContent, 'utf8');
