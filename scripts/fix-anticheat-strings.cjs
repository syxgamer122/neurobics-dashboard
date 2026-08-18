const fs = require('fs');

let anticheat = fs.readFileSync('tests/anticheat.test.ts', 'utf8');

anticheat = anticheat.replace(/"Majority of reaction times below 120ms"/g, '"Unusually high number of reaction times under 120ms"');

fs.writeFileSync('tests/anticheat.test.ts', anticheat);
console.log('Fixed anticheat test strings');
