#!/usr/bin/env node
/**
 * Ghep script thieu vao package.json hien co — KHONG ghi de toan bo file.
 * Chay: node tools/patch-package-scripts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = "package.json";
const pkg = JSON.parse(readFileSync(path, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.devDependencies = pkg.devDependencies || {};

const scripts = {
  "db:lint": "node tools/check-migrations.mjs",
  "db:normalize": "node tools/normalize-migrations.mjs",
  "db:baseline": "node tools/baseline-migrations.mjs",
  "db:push": "npx --yes supabase db push",
  "db:status": "npx --yes supabase migration list --linked",
  "functions:deploy": "npx --yes supabase functions deploy server",
  "test:coverage": "vitest run --coverage",
  scan: "node tests/scan.mjs",
  "build:only": "vite build",
};

// check: dam bao co db:lint + test:coverage neu chua co chuoi do
const wantCheck =
  "pnpm run typecheck && pnpm run scan && pnpm run db:lint && pnpm run test:coverage && pnpm run test:sim";
if (!pkg.scripts.check || !pkg.scripts.check.includes("db:lint")) {
  scripts.check = wantCheck;
}

const added = [];
for (const [k, v] of Object.entries(scripts)) {
  if (pkg.scripts[k] !== v) {
    pkg.scripts[k] = v;
    added.push(k);
  }
}

if (!pkg.devDependencies["@vitest/coverage-v8"]) {
  const vitestVer = pkg.devDependencies.vitest || "3.2.4";
  pkg.devDependencies["@vitest/coverage-v8"] = vitestVer;
  added.push("devDependency:@vitest/coverage-v8");
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(
  added.length
    ? `[patch] Da cap nhat: ${added.join(", ")}`
    : "[patch] package.json da du script, khong doi.",
);
