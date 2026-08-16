const fs = require('fs');

let antiPath = 'docs/feature_anticheat_observability.txt';
let anti = fs.readFileSync(antiPath, 'utf8');
anti = anti.replace(/`\/\S+\/g`/g, 'chuỗi regex');
fs.writeFileSync(antiPath, anti);

let monPath = 'docs/monitoring-alerts.md';
let mon = fs.readFileSync(monPath, 'utf8');
mon = mon.replace(/\* 100\.0 \//g, '* 100.0 /');
fs.writeFileSync(monPath, mon);

let opPath = 'docs/operations-dashboard.md';
let op = fs.readFileSync(opPath, 'utf8');
op = op.replace(/\* 100\.0 \//g, '* 100.0 /');
fs.writeFileSync(opPath, op);

let stPath = 'docs/staging-environment.md';
let st = fs.readFileSync(stPath, 'utf8');
st = st.replace(/\* Ensure your/g, 'Ensure your');
fs.writeFileSync(stPath, st);
