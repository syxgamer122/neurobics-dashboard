#!/usr/bin/env node
/**
 * Sinh baseline tu danh sach file trong supabase/migrations/.
 * Tao:
 *   supabase/baseline/applied-versions.txt
 *   supabase/baseline/mark-existing-as-applied.sql
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const OUT = "supabase/baseline";
const NAME_RE = /^(\d{8}|\d{14})_([a-z0-9_]+)\.sql$/i;

const entries = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((file) => {
    const m = NAME_RE.exec(file);
    if (!m) return null;
    return { version: m[1], name: m[2], file };
  })
  .filter(Boolean)
  .sort((a, b) => a.version.localeCompare(b.version));

if (!entries.length) {
  console.error("[db:baseline] Khong tim thay migration hop le.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const versionsPath = join(OUT, "applied-versions.txt");
writeFileSync(versionsPath, entries.map((e) => e.version).join("\n") + "\n");

const values = entries
  .map((e) => `  ('${e.version}', '${e.name}')`)
  .join(",\n");

const sql = `-- SINH TU DONG boi tools/baseline-migrations.mjs — dung sua tay.
-- Chay MOT LAN duy nhat, tren project ma schema DA khop voi ${entries.length} migration nay.
-- Sau do moi lan deploy chi con: supabase db push (CI da lo).

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);
alter table supabase_migrations.schema_migrations
  add column if not exists statements text[];
alter table supabase_migrations.schema_migrations
  add column if not exists name text;

insert into supabase_migrations.schema_migrations (version, name)
values
${values}
on conflict (version) do update set name = excluded.name;
`;

const sqlPath = join(OUT, "mark-existing-as-applied.sql");
writeFileSync(sqlPath, sql);

console.log(`[db:baseline] ${entries.length} version -> ${versionsPath}`);
console.log(`[db:baseline] SQL chot moc -> ${sqlPath}`);
console.log("[db:baseline] Dan SQL do vao Supabase SQL Editor (Run and enable RLS), roi: pnpm run db:status");
