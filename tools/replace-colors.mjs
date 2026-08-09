import fs from "fs/promises";
import path from "path";

async function walk(dir) {
  let results = [];
  const list = await fs.readdir(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(await walk(filePath));
    } else {
      if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
        results.push(filePath);
      }
    }
  }
  return results;
}

const replacements = [
  { pattern: /rgba\(13,\s*20,\s*45,/g, replacement: "rgba(var(--neuro-panel-rgb)," },
  { pattern: /rgba\(5,\s*10,\s*24,/g, replacement: "rgba(var(--neuro-ink-rgb)," },
  { pattern: /rgba\(10,\s*16,\s*36,/g, replacement: "rgba(var(--neuro-ink-rgb)," },
  { pattern: /rgba\(0,\s*212,\s*255,/g, replacement: "rgba(var(--neuro-cyan-rgb)," },
  { pattern: /rgba\(0,\s*180,\s*255,/g, replacement: "rgba(var(--neuro-cyan-rgb)," },
  { pattern: /rgba\(168,\s*85,\s*247,/g, replacement: "rgba(var(--neuro-purple-rgb)," },
  { pattern: /rgba\(16,\s*185,\s*129,/g, replacement: "rgba(var(--neuro-green-rgb)," },
  { pattern: /rgba\(244,\s*63,\s*94,/g, replacement: "rgba(var(--neuro-red-rgb)," },
  { pattern: /rgba\(239,\s*68,\s*68,/g, replacement: "rgba(var(--neuro-red-rgb)," },
  { pattern: /rgba\(245,\s*158,\s*11,/g, replacement: "rgba(var(--neuro-amber-rgb)," },
  { pattern: /rgba\(234,\s*179,\s*8,/g, replacement: "rgba(var(--neuro-amber-rgb)," }
];

async function run() {
  const files = await walk("src");
  for (const file of files) {
    let content = await fs.readFile(file, "utf-8");
    let changed = false;
    
    for (const r of replacements) {
      if (r.pattern.test(content)) {
        content = content.replace(r.pattern, r.replacement);
        changed = true;
      }
    }
    
    if (changed) {
      await fs.writeFile(file, content, "utf-8");
      console.log(`Updated ${file}`);
    }
  }
  console.log("Done!");
}

run().catch(console.error);
