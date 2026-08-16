const fs = require('fs');

let stPath = 'docs/staging-environment.md';
let st = fs.readFileSync(stPath, 'utf8');
st = st.replace(/^Ensure your /gm, '* Ensure your ');
fs.writeFileSync(stPath, st);

let revPath = 'ai_review.md';
if (fs.existsSync(revPath)) {
  let rev = fs.readFileSync(revPath, 'utf8');
  rev = rev.replace(/\/\* \.\.\.toàn bộ xử lý một ván\.\.\. \*\//g, '');
  fs.writeFileSync(revPath, rev);
}
