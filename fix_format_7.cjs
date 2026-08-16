const fs = require('fs');

let stPath = 'docs/staging-environment.md';
let st = fs.readFileSync(stPath, 'utf8');
st = st.replace(/- Ensure your /g, 'Ensure your ');
st = st.replace(/2\. Ensure your /g, 'Ensure your ');
fs.writeFileSync(stPath, st);

let monPath = 'docs/monitoring-alerts.md';
let mon = fs.readFileSync(monPath, 'utf8');
mon = mon.replace(/\* 100\.0 \//g, '* 100.0');
fs.writeFileSync(monPath, mon);

let opPath = 'docs/operations-dashboard.md';
let op = fs.readFileSync(opPath, 'utf8');
op = op.replace(/\* 100\.0 \//g, '* 100.0');
fs.writeFileSync(opPath, op);

let revPath = 'docs/ai_review.md';
if (fs.existsSync(revPath)) {
  let rev = fs.readFileSync(revPath, 'utf8');
  rev = rev.replace(/\/\* \.\.\.toàn bộ xử lý một ván\.\.\. \*\//g, '// ...toàn bộ xử lý một ván...');
  fs.writeFileSync(revPath, rev);
}
