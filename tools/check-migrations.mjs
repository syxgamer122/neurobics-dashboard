#!/usr/bin/env node
/**
 * Migration linter — chay trong CI (`pnpm run db:lint`).
 *
 * Bat cac loi khien `supabase db push` that bai HOAC chay sai thu tu, truoc khi
 * chung kip cham vao database that:
 *
 *  1. Ten file khong dung dinh dang <version>_<ten>.sql
 *  2. HAI file cung version  -> CLI chi ghi nhan mot ban, ban con lai bi bo im
 *     lang (du an nay dang co dung loi do: ba file 20260730_*).
 *  3. Migration MOI co version NHO HON version da ap dung -> CLI se bo qua.
 *  4. Cau lenh pha huy (drop table / truncate / drop column) khong duoc danh dau.
 *  5. File rong.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const BASELINE = "supabase/baseline/applied-versions.txt";
const NAME_RE = /^(\d{8}|\d{14})_([a-z0-9_]+)\.sql$/;
// Chan cung: mat du lieu khong the phuc hoi.
const DESTRUCTIVE = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdrop\s+column\b/i,
  /\bdrop\s+schema\b/i,
];
// Chi canh bao: rat pho bien va thuong nam trong than mot function.
const RISKY = [/\bdelete\s+from\b/i, /\bdrop\s+policy\b/i];
const ALLOW_MARK = /--\s*allow-destructive/i;

const errors = [];
const warnings = [];

const appliedVersions = existsSync(BASELINE)
  ? readFileSync(BASELINE, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  : [];
const isApplied = (version) => appliedVersions.includes(version);

if (!existsSync(DIR)) {
  console.error(`[db:lint] Khong thay ${DIR}`);
  process.exit(1);
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) errors.push("Khong co file migration nao.");

const byVersion = new Map();
for (const file of files) {
  const match = NAME_RE.exec(file);
  if (!match) {
    errors.push(
      `${file}: ten file sai. Dung <version>_<ten_snake_case>.sql, version 8 hoac 14 chu so (vd. 20260901000000_add_x.sql).`,
    );
    continue;
  }
  const [, version] = match;
  if (byVersion.has(version)) {
    errors.push(
      `Version trung "${version}": ${byVersion.get(version)} vs ${file}. Doi ten mot file (chay: pnpm run db:normalize).`,
    );
  } else {
    byVersion.set(version, file);
  }

  const sql = readFileSync(join(DIR, file), "utf8");
  if (sql.trim().length === 0) {
    errors.push(`${file}: file rong.`);
    continue;
  }
  if (!ALLOW_MARK.test(sql)) {
    for (const pattern of [...DESTRUCTIVE, ...RISKY]) {
      if (!pattern.test(sql)) continue;
      const hard = DESTRUCTIVE.includes(pattern);
      const note = `${file}: co cau lenh pha huy (${pattern.source}). Neu that su can, them dong "-- allow-destructive: ly do" o dau file.`;
      // Migration DA ap dung tren production thi khong sua duoc nua -> canh bao.
      // Migration MOI thi chan hang, tru khi duoc danh dau tuong minh.
      if (hard) (isApplied(version) ? warnings : errors).push(note);
      else warnings.push(note);
      break;
    }
  }
  if (!/if\s+not\s+exists|or\s+replace|if\s+exists/i.test(sql)) {
    warnings.push(
      `${file}: khong thay "if not exists"/"or replace" — chay lai se loi. Nen viet idempotent.`,
    );
  }
}

// Thu tu so voi nhung version da ap dung tren production.
if (appliedVersions.length) {
  {
    const applied = appliedVersions;
    const maxApplied = applied.reduce((a, b) => (a > b ? a : b));
    for (const [version, file] of byVersion) {
      if (!applied.includes(version) && version < maxApplied) {
        errors.push(
          `${file}: version ${version} nho hon version da ap dung ${maxApplied}. CLI se BO QUA file nay — hay doi ten voi timestamp moi.`,
        );
      }
    }
  }
} else {
  warnings.push(
    `Chua co ${BASELINE}. Chay "pnpm run db:baseline" de chot moc migration da ap dung tay.`,
  );
}

for (const w of warnings) console.warn(`[db:lint] canh bao — ${w}`);
for (const e of errors) console.error(`[db:lint] LOI — ${e}`);

console.log(
  `[db:lint] ${files.length} migration, ${errors.length} loi, ${warnings.length} canh bao.`,
);
process.exit(errors.length > 0 ? 1 : 0);
