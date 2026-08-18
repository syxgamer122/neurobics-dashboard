const fs = require('fs');

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

// 1. Remove HUMAN_FLOOR_MS check from validation.ts
const valPath = 'supabase/functions/_shared/scoring/validation.ts';
replaceRegex(valPath, /if \(r > 0 && r < HUMAN_FLOOR_MS\) throw new Error\(`\$\{label\}: reaction time too fast \(\$\{r\}ms < \$\{HUMAN_FLOOR_MS\}ms\)`\);/, '// Removed HUMAN_FLOOR_MS check from validation per Iteration 11 architecture.\n    // It is now handled by the Signal Extractor in anticheat.ts.');


// 2. Add HUMAN_FLOOR_MS check to anticheat.ts in inspectSubThreshold
const antiPath = 'supabase/functions/_shared/anticheat.ts';
const antiTarget = /const borderline = rts\.filter\(\(r\) => r >= HUMAN_FLOOR_MS && r < 120\);\n  if \(\!borderline\.length\) return \[\];/;
const antiReplacement = `const borderline = rts.filter((r) => r >= HUMAN_FLOOR_MS && r < 120);
  const inhuman = rts.filter((r) => r > 0 && r < HUMAN_FLOOR_MS);
  
  const flags: CheatFlag[] = [];
  
  if (inhuman.length > 0) {
    flags.push({
      msg: \`\${inhuman.length} reaction times under \${HUMAN_FLOOR_MS}ms (inhuman speed)\`,
      severity: "soft",
      detail: { count: inhuman.length, sample: inhuman.slice(0, 5) },
    });
  }

  if (borderline.length > 0) {`;

// Wait, inspectSubThreshold currently returns an array directly:
// const field = RT_FIELD[game] || "rts";
// const rts = nums((t as any)?.[field] ?? t?.rts);
// if (!rts.length) return [];
// const borderline = rts.filter((r) => r >= HUMAN_FLOOR_MS && r < 120);
// if (!borderline.length) return [];
// const overHalf = borderline.length > rts.length / 2;
// if (!overHalf) return [];
// return [{ ... }];

const newAntiTarget = /const borderline = rts\.filter\(\(r\) => r >= HUMAN_FLOOR_MS && r < 120\);\n  if \(\!borderline\.length\) return \[\];\n  \/\/ Mot vai mau thi binh thuong; qua nua so mau duoi 120ms moi dang ngo\.\n  const overHalf = borderline\.length > rts\.length \/ 2;\n  if \(\!overHalf\) return \[\];\n  return \[\n    \{\n      msg: "Unusually high number of reaction times under 120ms",\n      severity: "soft",\n      detail: \{ count: borderline\.length, total: rts\.length \},\n    \},\n  \];/;

const newAntiReplacement = `const flags: CheatFlag[] = [];
  
  const inhuman = rts.filter((r) => r > 0 && r < HUMAN_FLOOR_MS);
  if (inhuman.length > 0) {
    flags.push({
      msg: "Reaction time under human limit (" + HUMAN_FLOOR_MS + "ms)",
      severity: "soft",
      detail: { count: inhuman.length, total: rts.length },
    });
  }

  const borderline = rts.filter((r) => r >= HUMAN_FLOOR_MS && r < 120);
  // Mot vai mau thi binh thuong; qua nua so mau duoi 120ms moi dang ngo.
  const overHalf = borderline.length > rts.length / 2;
  if (overHalf) {
    flags.push({
      msg: "Unusually high number of reaction times under 120ms",
      severity: "soft",
      detail: { count: borderline.length, total: rts.length },
    });
  }
  
  return flags;`;

replaceRegex(antiPath, newAntiTarget, newAntiReplacement);
