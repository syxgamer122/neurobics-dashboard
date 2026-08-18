const fs = require('fs');
let code = fs.readFileSync('docs/feature_anticheat_observability.txt', 'utf8');

// Replace severity definitions and usages
code = code.replace(/\*\*hard\*\*/g, '**physical** (or statistical)');
code = code.replace(/\*\*soft\*\*/g, '**statistical**');
code = code.replace(/DA\?NH HARD FLAG/g, 'DA?NH REJECT FLAG (>=2 statistical hoặc 1 physical)');
code = code.replace(/DA\?NH SOFT FLAG/g, 'CH? CÓ STATISTICAL FLAG (<2)');

fs.writeFileSync('docs/feature_anticheat_observability.txt', code);
console.log('Fixed docs/feature_anticheat_observability.txt');
