const fs = require('fs');
const path = require('path');
const docsPath = path.join(__dirname, 'docs');

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else if (fullPath.endsWith('.txt') || fullPath.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(docsPath);
for (const file of files) {
  if (file.includes('adr-0001') || file.includes('0005') || file.includes('0007')) continue;
  if (file.includes('ai_review.md') || file.includes('docs_for_review.txt')) continue;

  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const replacements = [
    [/LocalStorage/gi, 'IndexedDB'],
    [/stats_epoch/g, 'stats_generation'],
    [/queue\.shift\(\);/g, '// queue.shift removed in favor of IndexedDB quota'],
    [/Record<string, number>/g, 'Record<GameId, number>'],
    [/100% accurate/gi, 'highly accurate'],
    [/revert version/gi, 'rollback version'],
    [/raw\.length\s*>\s*32\.000/g, 'raw size > limit'],
    [/raw\.length\s*>\s*32/g, 'raw size > limit'],
    [/migration first/gi, 'migration before deployment']
  ];

  for (const [re, replacement] of replacements) {
    if (re.test(content)) {
      content = content.replace(re, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
  }
}
