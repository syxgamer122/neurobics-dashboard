const fs = require('fs');
const path = require('path');
const docsPath = path.join(process.cwd(), 'docs');

function replaceInFile(fileName, searches, replacements) {
  const p = path.join(docsPath, fileName);
  if (!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8');
  for (let i = 0; i < searches.length; i++) {
    c = c.replace(searches[i], replacements[i]);
  }
  fs.writeFileSync(p, c);
  console.log(`Updated ${fileName}`);
}

replaceInFile('feature_auth_profile.txt', [
  /updateUser/g,
  /saveBirthYear/g,
  /uploadAvatar/g
], [
  'update_my_email',
  'update_my_birth_date',
  'update_my_avatar'
]);

replaceInFile('architecture-contracts.md', [
  /updateUser/g
], [
  'update_my_email'
]);

replaceInFile('feature_ui_dashboard.txt', [
  /saveBirthYear/g
], [
  'update_my_birth_date'
]);

replaceInFile('privacy-and-terms.md', [
  /90-180 ngày/g
], [
  '180 ngày'
]);
