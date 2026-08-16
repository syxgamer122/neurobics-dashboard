const fs = require('fs');

// 1. feature_anticheat_observability.txt: fix escaped backslash
let antiPath = 'docs/feature_anticheat_observability.txt';
if (fs.existsSync(antiPath)) {
  let anti = fs.readFileSync(antiPath, 'utf8');
  anti = anti.replace(/\$\ge 9\$/g, '>= 9');
  anti = anti.replace(/\$\to\$/g, '->');
  fs.writeFileSync(antiPath, anti);
}

// 2. feature_auth_profile.txt: fix trailing slash
let authPath = 'docs/feature_auth_profile.txt';
if (fs.existsSync(authPath)) {
  let auth = fs.readFileSync(authPath, 'utf8');
  auth = auth.replace(/trong avatars\/\{userId\}\//g, 'trong avatars/{userId}');
  fs.writeFileSync(authPath, auth);
}

// 3. staging-environment.md: fix orphan prefix
let stgPath = 'docs/staging-environment.md';
if (fs.existsSync(stgPath)) {
  let stg = fs.readFileSync(stgPath, 'utf8');
  stg = stg.replace(/2\. Ensure your /g, '- Ensure your ');
  fs.writeFileSync(stgPath, stg);
}

// 4. monitoring-alerts.md: fix trailing slash
let monPath = 'docs/monitoring-alerts.md';
if (fs.existsSync(monPath)) {
  let mon = fs.readFileSync(monPath, 'utf8');
  mon = mon.replace(/\* 100\.0 \//g, '* 100.0 / ');
  fs.writeFileSync(monPath, mon);
}

// 5. operations-dashboard.md: fix trailing slash
let opPath = 'docs/operations-dashboard.md';
if (fs.existsSync(opPath)) {
  let op = fs.readFileSync(opPath, 'utf8');
  op = op.replace(/\* 100\.0 \//g, '* 100.0 / ');
  fs.writeFileSync(opPath, op);
}
