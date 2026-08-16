const fs = require('fs');

// offline-queue.ts
let offPath = 'src/app/lib/offline-queue.ts';
if (fs.existsSync(offPath)) {
  let off = fs.readFileSync(offPath, 'utf8');
  if (!off.includes('import { TELEMETRY_SCHEMA_VERSION } from "./telemetry-version"')) {
     off = 'import { TELEMETRY_SCHEMA_VERSION } from "./telemetry-version";\n' + off;
  }
  off = off.replace(/schemaVersion:\s*1\s*,/g, 'schemaVersion: TELEMETRY_SCHEMA_VERSION,');
  off = off.replace(/\/\/ Mặc định là 1/g, '// Lấy từ TELEMETRY_SCHEMA_VERSION');
  fs.writeFileSync(offPath, off);
}

// scoring/core.ts
let corePath = 'supabase/functions/_shared/scoring/core.ts';
if (fs.existsSync(corePath)) {
  let core = fs.readFileSync(corePath, 'utf8');
  core = core.replace(/import \{ TELEMETRY_SCHEMA_VERSION[^\n]+\n/g, '');
  core = 'import { TELEMETRY_SCHEMA_VERSION } from "../../../src/app/lib/telemetry-version.ts";\n' + core;
  fs.writeFileSync(corePath, core);
}

// remove from limits.ts
let limitsPath = 'supabase/functions/_shared/limits.ts';
if (fs.existsSync(limitsPath)) {
  let limits = fs.readFileSync(limitsPath, 'utf8');
  limits = limits.replace(/export const TELEMETRY_SCHEMA_VERSION = 1;\n/g, '');
  fs.writeFileSync(limitsPath, limits);
}
