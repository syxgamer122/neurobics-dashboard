// Quet tinh (static scan) phia client: i18n, ky tu vo, hang so, localStorage.
//
// Chay: node tests/scan.mjs
//
// LUU Y VE DO TIN CAY: ban dau bo quet nay bao 15 key i18n "khong ton tai" va
// hang chuc hang so "khong khai bao" — TAT CA deu la duong tinh gia:
//   * i18n.tsx thut le KHONG dong nhat (co dong 0 space, co dong 2, co dong 4)
//     nen regex /^\s{2}key:/ bo sot;
//   * chu IN HOA nam trong chuoi hien thi ("ACCESS DENIED", ma mau "A855F7")
//     bi doc thanh ten hang so.
// Vi vay giờ moi phan tich deu chay tren ban da BOC BO chuoi + comment, va key
// i18n duoc lay theo do sau ngoac thay vi theo thut le.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Windows: URL.pathname la "/C:/Users/..." — path.resolve se tao "C:\C:\...".
// fileURLToPath + decode dung cho ca Win/Linux/macOS.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const rel = (p) => p.replace(ROOT + "/", "");
let issues = 0;
const report = (sev, msg) => {
  if (sev === "ERR") issues++;
  console.log(`${sev.padEnd(4)} ${msg}`);
};

/**
 * Thay noi dung moi chuoi ('..', "..", `..`) va comment bang dau cach, giu
 * nguyen so ky tu va so dong de vi tri/dong van khop voi file goc.
 */
function stripStringsAndComments(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        // Template literal: ${...} van la CODE, khong boc.
        if (quote === "`" && src[j] === "$" && src[j + 1] === "{") {
          blank(i + 1, j);
          let depth = 1;
          let k = j + 2;
          while (k < src.length && depth > 0) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}") depth--;
            k++;
          }
          i = k;
          j = k;
          // Tiep tuc quet phan con lai cua template tu vi tri moi.
          while (j < src.length && src[j] !== "`") {
            if (src[j] === "\\") j += 2;
            else j++;
          }
          blank(i, j);
          i = j + 1;
          break;
        }
        j++;
      }
      if (i <= j && src[j] === quote) {
        blank(i + 1, j);
        i = j + 1;
      } else if (i < src.length && src[i] === quote) {
        i++;
      }
    } else {
      i++;
    }
  }
  return out.join("");
}

// ---------- 1. i18n: trich key theo DO SAU NGOAC ----------
const viPath = path.join(SRC, "app/lib/i18n/vi.ts");
const enPath = path.join(SRC, "app/lib/i18n/en.ts");
const viCode = stripStringsAndComments(fs.readFileSync(viPath, "utf8"));
const enCode = stripStringsAndComments(fs.readFileSync(enPath, "utf8"));

/** Lay cac key o tang ngoai cung cua object literal, bo qua thut le. */
function extractDict(code, startRe) {
  const m = startRe.exec(code);
  if (!m) return null;
  const open = code.indexOf("{", m.index);
  if (open === -1) return null;
  const keys = [];
  let depth = 0;
  let i = open;
  for (; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1) {
      const m2 = /^([A-Za-z_$][\w$]*)\s*:/.exec(code.slice(i, i + 80));
      if (m2) {
        const prev = code.slice(0, i).replace(/\s+$/, "").slice(-1);
        // Chi tinh la key khi dung sau '{' hoac ',' — tranh bat 'number' trong
        // '(n: number)' hay nhan cua toan tu ba ngoi.
        if (prev === "{" || prev === ",") {
          keys.push(m2[1]);
          i += m2[0].length - 1;
        }
      }
    }
  }
  return keys;
}

const viKeys = extractDict(viCode, /(?:export\s+)?const vi\s*=\s*\{/);
const enKeys = extractDict(enCode, /(?:export\s+)?const en\s*:[^=]*=\s*\{/);

console.log("===== 1. i18n =====");
let viSet = new Set();
let used = new Map();
if (!viKeys || !enKeys) {
  report("ERR", "khong trich duoc tu dien vi/en");
} else {
  console.log(`     vi: ${viKeys.length} key, en: ${enKeys.length} key`);
  viSet = new Set(viKeys);
  const enSet = new Set(enKeys);
  for (const k of viKeys)
    if (!enSet.has(k)) report("ERR", `en THIEU key "${k}"`);
  for (const k of enKeys)
    if (!viSet.has(k)) report("ERR", `vi THIEU key "${k}"`);

  const dup = (keys, name) => {
    const seen = new Set();
    for (const k of keys) {
      if (seen.has(k)) report("ERR", `${name} co key TRUNG "${k}"`);
      seen.add(k);
    }
  };
  dup(viKeys, "vi");
  dup(enKeys, "en");
  if (viKeys.length === enKeys.length && viSet.size === viKeys.length)
    console.log("     OK: vi/en khop nhau, khong key trung");
}

// ---------- 2. Moi t.<key> dung trong code co ton tai? ----------
console.log("\n===== 2. t.<key> duoc dung nhung khong co trong tu dien =====");
for (const f of files) {
  const s = stripStringsAndComments(fs.readFileSync(f, "utf8"));
  const re = /\bt\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(s))) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(rel(f));
  }
}

// Game Registry tham chiếu i18n động qua t[game.tagKey] / t[descriptionKey].
// Ghi nhận các key literal trong registry để không báo unused giả, đồng thời
// phần kiểm tra `missing` bên dưới vẫn bắt được key registry không có trong từ điển.
const gameRegistryPath = path.join(SRC, "app/lib/game-registry.ts");
if (fs.existsSync(gameRegistryPath)) {
  const registryRaw = fs.readFileSync(gameRegistryPath, "utf8");
  const registryKeyRe = /(?:tagKey|descriptionKey):\s*"([A-Za-z_$][\w$]*)"/g;
  let registryMatch;
  while ((registryMatch = registryKeyRe.exec(registryRaw))) {
    const key = registryMatch[1];
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(rel(gameRegistryPath));
  }
}

let missing = 0;
for (const [k, where] of [...used].sort()) {
  if (viSet.size && !viSet.has(k)) {
    missing++;
    report("ERR", `t.${k} khong co trong tu dien  (${[...where].join(", ")})`);
  }
}
if (!missing) console.log("     OK: tat ca t.<key> deu ton tai");

// ---------- 3. Key khai bao nhung khong dung ----------
console.log("\n===== 3. Key khai bao nhung khong dung o dau (khong chan build) =====");
if (viKeys) {
  const unused = viKeys.filter((k) => !used.has(k));
  if (unused.length)
    report("WARN", `${unused.length} key khong duoc dung: ${unused.join(", ")}`);
  else console.log("     OK");
}

// ---------- 4. Ky tu UTF-8 vo ----------
console.log("\n===== 4. Ky tu UTF-8 vo (U+FFFD) =====");
let broken = 0;
for (const f of [...files, ...walk(path.join(ROOT, "supabase")).filter(() => false)]) {
  const s = fs.readFileSync(f, "utf8");
  s.split("\n").forEach((l, i) => {
    if (l.includes("\uFFFD")) {
      broken++;
      report("ERR", `${rel(f)}:${i + 1}  ${l.trim().slice(0, 90)}`);
    }
  });
}
// Quet ca .sql / .md ngoai src
for (const dir of ["supabase", "sql-chia-nho"]) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  const stack = [d];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(sql|ts|tsx|md)$/.test(e.name)) {
        fs.readFileSync(p, "utf8")
          .split("\n")
          .forEach((l, i) => {
            if (l.includes("\uFFFD")) {
              broken++;
              report("ERR", `${rel(p)}:${i + 1}  ${l.trim().slice(0, 90)}`);
            }
          });
      }
    }
  }
}
if (!broken) console.log("     OK: khong con ky tu vo");

// ---------- 5. Hang so SCREAMING_CASE dung ma khong khai bao ----------
// Chay tren ban da boc chuoi VA boc JSX text.
// Chi boc chuoi la chua du: chu trong JSX (<div>ACCESS DENIED</div>) khong he
// co dau nhay, nen "ACCESS", "DENIED", "ADMIN PANEL"... van bi doc thanh ten
// hang so. Boc luon phan text giua '>' va '<'.
function stripJsxText(src) {
  const out = src.split("");
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== ">") continue;
    const end = src.indexOf("<", i + 1);
    if (end === -1) break;
    const seg = src.slice(i + 1, end);
    // Chi boc khi doan giua khong chua ky tu cua code (tranh boc bieu thuc).
    if (!/[{}();=]/.test(seg)) {
      for (let k = i + 1; k < end; k++) if (out[k] !== "\n") out[k] = " ";
    }
    i = end - 1;
  }
  return out.join("");
}

console.log("\n===== 5. Hang so SCREAMING_CASE dung ma khong khai bao =====");
let undef = 0;
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const s = stripJsxText(stripStringsAndComments(raw));
  const usedC = new Set();
  // Bo qua truy cap thuoc tinh (Math.SQRT2, import.meta.env.PROD, obj.MEMORY):
  // do la thuoc tinh cua doi tuong khac, khong phai hang so cua file nay.
  const re = /(^|[^.\w$])([A-Z][A-Z0-9_]{3,})\b/g;
  let m;
  while ((m = re.exec(s))) usedC.add(m[2]);
  for (const c of usedC) {
    const declared =
      new RegExp(`(const|let|var|enum|function)\\s+${c}\\b`).test(s) ||
      new RegExp(`import[^;]*\\b${c}\\b[^;]*from`).test(s) ||
      // re-export: export { AXIS_COLUMNS, AXIS_META } from "./axes"
      new RegExp(`export\\s*\\{[^}]*\\b${c}\\b[^}]*\\}`).test(s) ||
      // tham so / destructuring: ({ MEMORY }) => ... , case "MEMORY":
      new RegExp(`\\{[^{}]*\\b${c}\\b[^{}]*\\}\\s*[=:)]`).test(s) ||
      new RegExp(`\\b${c}\\s*[:=]`).test(s);
    const env =
      /^(JSON|NaN|URL|URLS|API|GET|POST|PUT|HEAD|HTTP|HTTPS|UTC|GMT|CSS|HTML|SVG|DOM|RGB|RGBA|USD|VND|NULL|TRUE|FALSE|CSV|PDF|PNG|JPG|TODO|FIXME|NOTE|ERROR|WARN|INFO|DEBUG|MATH|DATE|NUMBER|STRING|BOOLEAN|OBJECT|ARRAY|PROMISE|WINDOW|DOCUMENT|CONSOLE|IMPORT|EXPORT|REACT|VITE|NODE|MEMORY|FOCUS|LOGIC|REFRESH|ACCESS|DENIED|ADMIN|PANEL|CRITICAL)$/.test(
        c,
      );
    if (!declared && !env) {
      undef++;
      report("ERR", `${rel(f)}: dung ${c} nhung khong thay khai bao/import`);
    }
  }
}
if (!undef) console.log("     OK");

// ---------- 6. localStorage ----------
console.log("\n===== 6. localStorage dung bien chua khai bao =====");
let ls = 0;
for (const f of files) {
  const s = stripStringsAndComments(fs.readFileSync(f, "utf8"));
  const re = /localStorage\.(get|set|remove)Item\(\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[2];
    if (
      !new RegExp(`(const|let|var)\\s+${v}\\b`).test(s) &&
      !new RegExp(`import[^;]*\\b${v}\\b[^;]*from`).test(s) &&
      // tham so ham / bien vong lap: (k) => localStorage.removeItem(k)
      !new RegExp(`[(,]\\s*${v}\\s*[),:]`).test(s) &&
      !new RegExp(`(of|in)\\s+[\\w.$]+\\)?\\s*\\{[\\s\\S]{0,200}${v}`).test(s)
    ) {
      ls++;
      report("ERR", `${rel(f)}: localStorage dung bien ${v} chua khai bao`);
    }
  }
}
if (!ls) console.log("     OK");

console.log("\n==================================================");
console.log(issues === 0 ? "KHONG PHAT HIEN LOI CHAN (ERR)" : `${issues} loi ERR`);
process.exit(issues === 0 ? 0 : 1);
