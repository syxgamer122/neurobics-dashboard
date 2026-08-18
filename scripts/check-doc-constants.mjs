import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');

const constantsToCheck = [
  {
    name: 'MIN_AGE_YEARS = 16',
    regex: /13/g,
    filesToIgnore: [],
    condition: (matches, filename, content) => {
      // If we find '13' in context of age, year, or birth
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('13') && (lines[i].toLowerCase().includes('tuổi') || lines[i].toLowerCase().includes('age') || lines[i].toLowerCase().includes('year'))) {
           if (!lines[i].includes('130ms') && !lines[i].includes('Nghị định 13') && !lines[i].includes('KI-13')) { // Whitelist
               console.error(`[ERROR] Found '13' age reference in ${filename}: ${lines[i].trim()}`);
               return false;
           }
        }
      }
      return true;
    }
  },
  {
    name: 'Storage Matrix: No IndexedDB for sb-*',
    regex: /IndexedDB/gi,
    filesToIgnore: ['feature_offline_pwa.txt'], // Offline PWA is allowed to use IndexedDB for queue
    condition: (matches, filename, content) => {
      const lines = content.split('\n');
      let pass = true;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('indexeddb') && !lines[i].toLowerCase().includes('thay vì indexeddb') && (lines[i].toLowerCase().includes('sb-') || lines[i].toLowerCase().includes('theme') || lines[i].toLowerCase().includes('profile'))) {
           console.error(`[ERROR] Found IndexedDB used for profile/theme in ${filename}: ${lines[i].trim()}`);
           pass = false;
        }
      }
      return pass;
    }
  },
  {
    name: 'No submitted_at = now()',
    regex: /submitted_at\s*=\s*now\(\)/g,
    filesToIgnore: [],
    condition: (matches, filename, content) => {
      if (matches && matches.length > 0) {
        console.error(`[ERROR] Found 'submitted_at = now()' in ${filename}. Must use state machine.`);
        return false;
      }
      return true;
    }
  },
  {
    name: 'MAX_OFFLINE_AGE_MS 7 days reject check',
    regex: /7 ngày/gi,
    filesToIgnore: [],
    condition: (matches, filename, content) => {
      const lines = content.split('\n');
      let pass = true;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('7 ngày') && (lines[i].toLowerCase().includes('từ chối') || lines[i].toLowerCase().includes('reject') || lines[i].toLowerCase().includes('xoá'))) {
           // We allow 'stale' or 'xp = 0'
           if (!lines[i].toLowerCase().includes('không reject')) {
               console.error(`[ERROR] Found 7-day reject reference in ${filename}: ${lines[i].trim()}`);
               pass = false;
           }
        }
      }
      return pass;
    }
  }
];

function scanDocs() {
  let allPass = true;
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') || f.endsWith('.txt'));

  for (const file of files) {
    const filepath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filepath, 'utf8');

    for (const rule of constantsToCheck) {
      if (rule.filesToIgnore.includes(file)) continue;

      const matches = content.match(rule.regex);
      if (!rule.condition(matches, file, content)) {
        allPass = false;
      }
    }
  }

  if (!allPass) {
    console.error('\n❌ check:doc-constants FAILED. Mismatched constants found.');
    process.exit(1);
  } else {
    console.log('✅ check:doc-constants PASSED. All constants are synchronized.');
  }
}

scanDocs();
