import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { GAME_IDS } from "../_shared/round-scoring.ts";

// Admin client (service role) — required to create a confirmed auth user.
// Supabase CLI tu choi dat secret co ten bat dau bang SUPABASE_, nen key
// sb_secret_ moi phai mang ten rieng la EDGE_SERVICE_ROLE_KEY. Van fallback
// ve bien tu dong de `supabase functions serve` chay o local khong can them
// cau hinh gi.
const ADMIN_SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
const ADMIN_SERVICE_KEY =
  Deno.env.get("EDGE_SERVICE_ROLE_KEY")?.trim() ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

if (!ADMIN_SUPABASE_URL) {
  throw new Error("Missing required Edge Function secret: SUPABASE_URL");
}
if (!ADMIN_SERVICE_KEY) {
  throw new Error(
    "Missing Edge admin key: set EDGE_SERVICE_ROLE_KEY (sb_secret_) or use the legacy SUPABASE_SERVICE_ROLE_KEY",
  );
}

export const adminClient = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_KEY);

const SESSION_COLUMNS = GAME_IDS.map((game) => `${game}_sessions` as const);
const SESSION_SELECT = SESSION_COLUMNS.join(", ");
export const EMPTY_SESSION_PATCH = Object.fromEntries(
  SESSION_COLUMNS.map((column) => [column, 0]),
);
export const PROFILE_COLS = `id, username, avatar_url, role, birth_year, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, ${SESSION_SELECT}, created_at`;
// Ca nha thuong dung chung mot duong mang, nen mot dia chi phai du cho
// vai nguoi cung dang ky.
export const SIGNUP_LIMIT = 10;
export const SIGNUP_WINDOW_SECONDS = 15 * 60;
export const RECOVERY_LIMIT = 10;
export const RECOVERY_WINDOW_SECONDS = 60 * 60;
export const MAX_TICKET_STARTS_PER_MINUTE = 20;
// Tran XP tuyet doi cho moi duong ghi (admin grant lan thuong theo van).
// Level = floor((-1 + sqrt(1 + xp/12.5))/2)+1, nen 200 trieu XP ~ level 2000.
export const XP_MAX = 200_000_000;
