const fs = require('fs');

let monPath = 'docs/monitoring-alerts.md';
let mon = fs.readFileSync(monPath, 'utf8');
mon = mon.replace(/\* 100\.0 \//g, '* 100.0 / ');
fs.writeFileSync(monPath, mon);

let opPath = 'docs/operations-dashboard.md';
let op = fs.readFileSync(opPath, 'utf8');
op = op.replace(/\* 100\.0 \//g, '* 100.0 / ');
fs.writeFileSync(opPath, op);

let stPath = 'docs/staging-environment.md';
let st = fs.readFileSync(stPath, 'utf8');
st = st.replace(/^Ensure your/gm, '- Ensure your');
fs.writeFileSync(stPath, st);
