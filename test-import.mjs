/* eslint-disable */

import fs from "fs";
import path from "path";
const distAssets = path.join("dist", "assets");
const files = fs
  .readdirSync(distAssets)
  .filter((f) => f.startsWith("index-") && f.endsWith(".js"));
for (const file of files) {
  try {
    await import("file://" + process.cwd() + "/dist/assets/" + file);
  } catch (e) {
    console.error("Error loading " + file, e);
  }
}
