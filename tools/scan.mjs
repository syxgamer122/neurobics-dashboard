import fs from "fs";
import path from "path";

const CLIENT_DIRS = ["src/app", "supabase/functions"];
const FORBIDDEN_IN_CLIENT = /_shared\/(round-scoring|scoring\/|anticheat)/;
const HARDCODED_80 = /(FLOOR|MIN_RT).*80/;

let errors = 0;

function scanDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const fullPath = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDir(fullPath);
    } else if (
      f.isFile() &&
      (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx"))
    ) {
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        // Only block _shared imports in src/app
        if (
          dir.startsWith("src/app") &&
          line.includes("import ") &&
          FORBIDDEN_IN_CLIENT.test(line)
        ) {
          console.error(
            `[forbidden-import] ${fullPath}:${i + 1}: ${line.trim()}`,
          );
          errors++;
        }
        // Block hardcoded 80 everywhere except _shared/limits.ts
        if (!fullPath.includes("limits.ts") && HARDCODED_80.test(line)) {
          console.error(`[hardcoded-80] ${fullPath}:${i + 1}: ${line.trim()}`);
          errors++;
        }
      });
    }
  }
}

for (const dir of CLIENT_DIRS) {
  if (fs.existsSync(dir)) scanDir(dir);
}

if (errors > 0) {
  console.error(`Found ${errors} issues.`);
  process.exit(1);
} else {
  console.log("Scan passed.");
}
