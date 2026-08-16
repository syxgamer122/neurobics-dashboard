const fs = require('fs');
const path = require('path');

if (fs.existsSync('src/app/lib/scoring.ts')) {
  fs.renameSync('src/app/lib/scoring.ts', 'src/app/lib/provisional-score.ts');
  let provPath = 'src/app/lib/provisional-score.ts';
  let prov = fs.readFileSync(provPath, 'utf8');
  prov = '// UI-only. Không import từ _shared/*. Kết quả không authoritative.\n' + prov;
  fs.writeFileSync(provPath, prov);
}

function replaceInDir(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) replaceInDir(full);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      let c = fs.readFileSync(full, 'utf8');
      if (c.includes('lib/scoring')) {
        c = c.replace(/lib\/scoring/g, 'lib/provisional-score');
        fs.writeFileSync(full, c);
      }
      if (c.includes('./scoring')) {
        c = c.replace(/\.\/scoring/g, './provisional-score');
        fs.writeFileSync(full, c);
      }
    }
  }
}
replaceInDir('src/app');
