import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(DOCS);
// Also include top-level docs
["docs_for_review.txt", "ai_review.md"].forEach((f) => {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
});

const rules = [
  { name: "escaped-backslash-quote", re: /\\[a-z_]+\\/ },
  { name: "raw-tab-in-prose", re: /[^\n\t]\t[^\n\t]/ },
  { name: "orphan-prefix", re: /["'`]\.[a-z_]+\./ },
  { name: "trailing-slash", re: /\/\s*$/m },
  {
    name: "brand-check",
    re: /(?:@)?neurobics(?:[.-_][a-z_]+)?/i,
    exclude: (p) => p.includes("adr-0001") || p.includes("ADR-0001"),
    excludeMatch: (m) =>
      m.toLowerCase().includes("neurobics-ui") ||
      m.toLowerCase().includes("neurobics.") ||
      m.toLowerCase().includes("neurobics_") ||
      m.toLowerCase().includes("@neurobics"),
  },
];

let errors = 0;
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const rule of rules) {
    if (rule.exclude && rule.exclude(file)) continue;

    // Quick check with global flag if possible, or just string.match
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      const match = line.match(rule.re);
      if (match) {
        if (rule.excludeMatch && rule.excludeMatch(match[0])) return;
        console.error(
          `[${rule.name}] ${path.basename(file)}:${i + 1}: ${line.trim()}`,
        );
        errors++;
      }
    });
  }
}

if (errors > 0) {
  console.log(`Found ${errors} doc formatting issues.`);
  process.exit(1);
} else {
  console.log("Doc scan passed.");
}
