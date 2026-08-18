const fs = require('fs');

let content = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');

content = content.replace(/Soft hay Reject/gi, "Warning hay Reject");

fs.writeFileSync('docs/feature_games_scoring.txt', content);

console.log('Fixed one more');
