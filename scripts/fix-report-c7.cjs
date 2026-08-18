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

// Checkboxes to unchecked
let content = fs.readFileSync('docs/implementation-report.md', 'utf8');
content = content.replace(/\[x\]/g, '[ ]');

fs.writeFileSync('docs/implementation-report.md', content);

// Status header
const statusHeader = `This document records the completed implementation of the final AI architectural review.

Implementation status: unverified
Production promotion status: pending

## Release Evidence (Phase 4 GA Checklist)`;

replaceRegex('docs/implementation-report.md', /This document records the completed implementation of the final AI architectural review\.[\s\S]+?## Release Evidence \(Phase 4 GA Checklist\)/, statusHeader);

// Add missing migrations
const plannedMigrations = `## 1. DB Migrations Created (Separated by purpose)

**Promotion Status:**
- [ ] Created
- [ ] Applied to staging

### Planned Migrations (Iteration 10)
- \`activated state\`, \`active_slot\`, \`submit_deadline\` cho \`round_tickets\`.
- \`rule-set hash/registry\` cho inspector rules.
- \`account_deletion_operations\` (Account deletion journal).
- \`birth_date\` validation (16 tuổi) trong profiles.
- \`raw_telemetry\` retention 180 days.
- \`rating_model_version\` trong scoring.

### Existing Migrations`;

replaceRegex('docs/implementation-report.md', /## 1\. DB Migrations Created \(Separated by purpose\)[\s\S]+?- \[ \] Applied to staging/, plannedMigrations);

console.log("Done");
