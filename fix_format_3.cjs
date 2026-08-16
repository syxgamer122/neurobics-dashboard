const fs = require('fs');

let antiPath = 'docs/feature_anticheat_observability.txt';
if (fs.existsSync(antiPath)) {
  let anti = fs.readFileSync(antiPath, 'utf8');
  anti = anti.replace(/\$\ge 9\$ chữ số/g, 'từ 9 chữ số trở lên');
  anti = anti.replace(/\$\to\$/g, '->');
  fs.writeFileSync(antiPath, anti);
}

let monPath = 'docs/monitoring-alerts.md';
if (fs.existsSync(monPath)) {
  let mon = fs.readFileSync(monPath, 'utf8');
  mon = mon.replace(/\* 100\.0 \/\r?\n/g, '* 100.0 /\n');
  fs.writeFileSync(monPath, mon);
}

let opPath = 'docs/operations-dashboard.md';
if (fs.existsSync(opPath)) {
  let op = fs.readFileSync(opPath, 'utf8');
  op = op.replace(/\* 100\.0 \/\r?\n/g, '* 100.0 /\n');
  fs.writeFileSync(opPath, op);
}

let stgPath = 'docs/staging-environment.md';
if (fs.existsSync(stgPath)) {
  let stg = fs.readFileSync(stgPath, 'utf8');
  stg = stg.replace(/Ensure your `\.env\.local` is pointed to the Supabase Staging URL and Anon Key\./g, '- Ensure your `.env.local` is pointed to the Supabase Staging URL and Anon Key.');
  fs.writeFileSync(stgPath, stg);
}
