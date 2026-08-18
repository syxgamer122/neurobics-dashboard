const fs = require('fs');

function fixFile(path) {
  let content = fs.readFileSync(path, 'utf8');

  content = content.replace(/hard\/Statistical Warnings/gi, "physical/statistical signals");
  content = content.replace(/Statistical Warnings, không hard/gi, "statistical signal, không reject");
  content = content.replace(/decision\.hardReject/g, "decision.shouldReject");
  content = content.replace(/luật hard mới/gi, "luật physical mới");
  
  fs.writeFileSync(path, content);
}

fixFile('docs/feature_anticheat_observability.txt');
fixFile('docs/feature_games_scoring.txt');

console.log('Fixed more docs');
