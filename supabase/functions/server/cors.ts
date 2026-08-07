// ─── CORS allowlist ────────────────────────────────────────────────────
// ALLOWED_ORIGINS la danh sach phan cach boi dau phay. Van giu default
// production de deploy cu khong bi mat truy cap.
//
// TRUOC DAY default con gom ca http://localhost:5173 + http://127.0.0.1:5173.
// Nghia la neu quen set ALLOWED_ORIGINS tren production thi BAT KY may dev nao
// cung goi duoc API that (login, submit-round, admin-*) tu localhost — chi can
// mo Vite o may minh la co the doc/ghi DB thuc.
//
// GIO origin loopback CHI duoc phep khi bat tuong minh ALLOW_LOCALHOST_ORIGINS=1.
// Co nay chi dat khi chay `supabase functions serve` o may minh, TUYET DOI
// khong dat tren production. Loopback con bi loc ra ke ca khi bi dat lan vao
// ALLOWED_ORIGINS, de mot lan copy-paste cau hinh khong lam ro lai lo hong.
const PRODUCTION_ORIGINS = [
  "https://nguyenhuumanh.vercel.app",
  "https://mindgem-dashboard-pfl3.vercel.app",
];
const LOCALHOST_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    // Khong parse duoc thi coi nhu khong phai loopback: allowlist se tu chan.
    return false;
  }
}

function resolveAllowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const base = configured.length > 0 ? configured : PRODUCTION_ORIGINS;

  if (Deno.env.get("ALLOW_LOCALHOST_ORIGINS") === "1") {
    console.log(
      "CORS: ALLOW_LOCALHOST_ORIGINS=1 — dang cho phep loopback (chi dung o local).",
    );
    return [...new Set([...base, ...LOCALHOST_ORIGINS])];
  }

  const safe = base.filter((origin) => !isLoopbackOrigin(origin));
  if (safe.length !== base.length) {
    console.log(
      "CORS: da loai origin loopback khoi allowlist. Dat ALLOW_LOCALHOST_ORIGINS=1 neu dang chay local.",
    );
  }
  return safe;
}

export const ALLOWED_ORIGINS = resolveAllowedOrigins();
