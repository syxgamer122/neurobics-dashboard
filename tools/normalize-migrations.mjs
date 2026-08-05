#!/usr/bin/env node
/**
 * Doi ten cac file migration trung version (cung 8/14 chu so dau).
 * Mac dinh chi IN ke hoach. Them --apply de doi ten that.
 *
 *   node tools/normalize-migrations.mjs
 *   node tools/normalize-migrations.mjs --apply
 */
import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const apply = process.argv.includes("--apply");
const NAME_RE = /^(\d{8}|\d{14})_([a-z0-9_]+)\.sql$/i;

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const byPrefix = new Map();

for (const file of files) {
  const m = NAME_RE.exec(file);
  if (!m) continue;
  const [, version, name] = m;
  // Chi nhom theo 8 chu so ngay (YYYYMMDD) de bat trung kieu 20260730_a / 20260730_b
  const day = version.slice(0, 8);
  if (!byPrefix.has(day)) byPrefix.set(day, []);
  byPrefix.get(day).push({ file, version, name });
}

const plan = [];
for (const [day, group] of byPrefix) {
  if (group.length < 2) continue;
  // Neu moi file da co version 14 so KHAC nhau thi bo qua
  const versions = new Set(group.map((g) => g.version));
  if (versions.size === group.length && [...versions].every((v) => v.length === 14)) {
    continue;
  }
  // Trung version (cung chuoi version, hoac cung day 8 so ma version ngan)
  const short = group.filter((g) => g.version.length === 8);
  const targets = short.length >= 2 ? short : group.filter((g) => {
    return group.filter((x) => x.version === g.version).length > 1;
  });
  const list = targets.length ? targets : group;
  // Sap xep on dinh theo ten file cu
  list.sort((a, b) => a.file.localeCompare(b.file));
  list.forEach((item, i) => {
    const seq = String((i + 1) * 10000).padStart(6, "0");
    const to = `${day}${seq}_${item.name}.sql`;
    if (to !== item.file) plan.push({ from: item.file, to });
  });
}

if (!plan.length) {
  console.log("[db:normalize] Khong co file nao can doi ten.");
  process.exit(0);
}

console.log("[db:normalize] Ke hoach:");
for (const { from, to } of plan) {
  console.log(`  ${from}  ->  ${to}`);
  if (apply) renameSync(join(DIR, from), join(DIR, to));
}

if (!apply) {
  console.log("\nChay lai voi --apply de thuc hien, sau do: pnpm run db:baseline");
} else {
  console.log(`\n[db:normalize] Da doi ten ${plan.length} file.`);
}
