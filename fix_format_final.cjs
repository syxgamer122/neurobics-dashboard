const fs = require('fs');

let antiPath = 'docs/feature_anticheat_observability.txt';
if (fs.existsSync(antiPath)) {
  let anti = fs.readFileSync(antiPath, 'utf8');
  anti = anti.replace(/\$\ge 9\$/g, '>= 9');
  anti = anti.replace(/\$\to\$/g, '->');
  fs.writeFileSync(antiPath, anti);
}

let monPath = 'docs/monitoring-alerts.md';
if (fs.existsSync(monPath)) {
  let mon = fs.readFileSync(monPath, 'utf8');
  mon = mon.replace(/\* 100\.0 \/\n/g, '* 100.0 / \n');
  fs.writeFileSync(monPath, mon);
}

let opPath = 'docs/operations-dashboard.md';
if (fs.existsSync(opPath)) {
  let op = fs.readFileSync(opPath, 'utf8');
  op = op.replace(/\* 100\.0 \/\n/g, '* 100.0 / \n');
  fs.writeFileSync(opPath, op);
}

let stgPath = 'docs/staging-environment.md';
if (fs.existsSync(stgPath)) {
  let stg = fs.readFileSync(stgPath, 'utf8');
  stg = stg.replace(/- Ensure your /g, 'Ensure your ');
  fs.writeFileSync(stgPath, stg);
}
