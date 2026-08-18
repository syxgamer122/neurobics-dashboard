const fs = require('fs');
const path = require('path');

function replaceRegex(filepath, targetRegex, replacement) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (content.match(targetRegex)) {
        content = content.replace(targetRegex, replacement);
        fs.writeFileSync(filepath, content);
        console.log('Success ' + filepath);
    } else {
        console.log('Not found in ' + filepath);
    }
}

replaceRegex(
    'docs/implementation-report.md',
    /- \[x\] Created\s+- \[x\] Applied to staging\s+- \[x\] Verified on production snapshot\s+- \[x\] Applied to production\s+- \[x\] Post-deploy verified/,
    '- [ ] Created\n- [ ] Applied to staging\n- [ ] Verified on production snapshot\n- [ ] Applied to production\n- [ ] Post-deploy verified'
);
