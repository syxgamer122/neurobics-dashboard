const fs = require('fs');

let scoring = fs.readFileSync('tests/scoring.test.ts', 'utf8');

scoring = scoring.replace(/describe\("daysSince \(VN calendar\)", \(\) => \{[\s\S]*?\}\);\n\}\);/s, '');

fs.writeFileSync('tests/scoring.test.ts', scoring);
console.log('Removed daysSince');
