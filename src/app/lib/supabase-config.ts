/**
 * Cau hinh Supabase — doc tu bien moi truong Vite.
 *
 * TRUOC DAY: project ref + anon key nam cung trong utils/supabase/info.tsx va
 * duoc commit vao Git. Hau qua thuc te:
 *   - Khong rotate duoc key khi can.
 *   - Khong tach duoc moi truong dev / staging / production: moi build deu
 *     dam thang vao DB that.
 *   - Nguoi clone repo khong biet can cau hinh nhung gi.
 *
 * GIO: bat buoc co VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY trong .env
 * (xem .env.example). Anon key van di ve trinh duyet — dieu do binh thuong vi
 * RLS moi la lop chan thuc su — nhung it nhat no da rotate duoc va tach duoc
 * theo moi truong.
 *
 * Module nay KHONG nem loi luc import: tests/observability.test.ts import chuoi
 * module nay bang node thuan (khong co .env). Loi chi nem dung luc that su can
 * ket noi, qua assertSupabaseConfig().
 */

// Dung `key: T | undefined` (khong phai `key?: T`) de tests/scan.mjs nhan ra
// ten SCREAMING_CASE la da khai bao — regex cua scan chi khop `NAME:` / `NAME=`,
// khong khop `NAME?:`.
type SupabaseMetaEnv = {
  VITE_SUPABASE_URL: string | undefined;
  VITE_SUPABASE_ANON_KEY: string | undefined;
};

// import.meta.env khong ton tai khi file duoc chay bang node thuan (tests),
// nen doc phong thu thay vi truy cap truc tiep.
const ENV = ((import.meta as unknown as { env?: SupabaseMetaEnv }).env ??
  {}) as SupabaseMetaEnv;

/** Bo dau `/` o cuoi de `${SUPABASE_URL}/functions/v1/...` khong thanh `//`. */
export const SUPABASE_URL = (ENV.VITE_SUPABASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export const SUPABASE_ANON_KEY = (ENV.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** Goc cua Edge Function `server`. */
export const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/server`;

/**
 * Da du cau hinh de goi mang hay chua. Telemetry dung co nay de im lang bo qua
 * thay vi nem loi — telemetry chet thi app van phai chay.
 */
export const HAS_SUPABASE_CONFIG =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

const SETUP_HINT =
  "Sao chep .env.example thanh .env roi dien gia tri tu Supabase Dashboard > Project Settings > API. Tren Vercel: Settings > Environment Variables (tick ca Production/Preview/Development).";

/**
 * Nem loi ro rang khi thieu cau hinh, thay vi de nguoi dung nhan 401 hoac loi
 * CORS kho hieu o tang duoi.
 */
export function assertSupabaseConfig(): void {
  const missing: string[] = [];
  if (SUPABASE_URL.length === 0) missing.push("VITE_SUPABASE_URL");
  if (SUPABASE_ANON_KEY.length === 0) missing.push("VITE_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Thieu bien moi truong: ${missing.join(", ")}. ${SETUP_HINT}`,
    );
  }
}
