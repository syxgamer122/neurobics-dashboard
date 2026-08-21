# TỔNG HỢP TOÀN BỘ HỆ THỐNG NHIỆM VỤ (QUESTS & CLAIM QUEST SYSTEM PACKAGE)

Gói tài liệu và mã nguồn hoàn chỉnh dành cho AI / Kỹ sư đánh giá và xử lý triệt để lỗi khi nhận thưởng nhiệm vụ (`claim_quest`).

---

## 1. NGUYÊN NHÂN GỐC RỄ LỖI "INSERT has more target columns than expressions"

### Hiện tượng thực tế trên Console / UI (ảnh chụp lỗi):
```text
Toast: INSERT has more target columns than expressions
POST https://pujzeonddvquxeacblvr.supabase.co/rest/v1/rpc/claim_quest 400 (Bad Request)
```

### Phân tích chi tiết 4 nguyên nhân trong SQL:
1. **Lỗi cú pháp đếm cột**:
   - Trong SQL cũ: `INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key) VALUES (v_user, 'quest', 0, v_xp);`
   - Khai báo 5 cột đích nhưng chỉ có 4 giá trị $ightarrow$ Thiếu giá trị `source_key`.
2. **Cột `source_key` và Unique Index**:
   - Cần bảo đảm cột `source_key` tồn tại trên `public.xp_events` và có unique index `xp_events_user_source_key_uq` để chống cộng thưởng trùng.
3. **Từ điển phần thưởng `quest_xp()` thiếu mã nhiệm vụ mới**:
   - Hàm `quest_xp()` cũ chỉ hỗ trợ 4 mã cũ, trong khi `get_daily_quests()` sinh ra rất nhiều mã mới (`q_rounds_5`, `q_score_750_2`, `w_rounds_25`, `w_games_7`...). Nếu không cấu hình, các mã này nhận 0 XP và văng lỗi `Quest is not configured`.
4. **Trùng lặp nguồn ghi XP (Dual XP Mutation)**:
   - Function cũ vừa `INSERT INTO xp_events` vừa chạy `UPDATE profiles SET total_xp = total_xp + v_xp`.
   - Chuẩn kiến trúc: Chỉ ghi vào Ledger (`xp_events`), trigger canonical `trg_xp_events_apply` sẽ tự động tính và cập nhật `profiles.total_xp` và `level`.

---

## 2. CÂU LỆNH SQL SỬA LỖI TRỰC TIẾP TRÊN SUPABASE DASHBOARD (HOTFIX)

Chỉ cần mở **Supabase Dashboard -> SQL Editor** của dự án và chạy đoạn script hoàn chỉnh sau:

```sql
-- =============================================================================
-- ROLL-FORWARD HOTFIX: FIX claim_quest, quest_xp, VÀ IDEMPOTENCY
-- =============================================================================

SET lock_timeout = '2s';

BEGIN;

-- 1. SCHEMA CHO IDEMPOTENCY
ALTER TABLE public.xp_events
ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_source_key_uq
ON public.xp_events(user_id, source_key)
WHERE source_key IS NOT NULL;

-- 2. ĐỊNH NGHĨA THƯỞNG CHO TẤT CẢ QUEST ĐANG HOẠT ĐỘNG
CREATE OR REPLACE FUNCTION public.quest_xp(p_code text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE
    -- Daily volume
    WHEN p_code = 'q_rounds_3' THEN 30
    WHEN p_code = 'q_rounds_5' THEN 40
    WHEN p_code = 'q_rounds_7' THEN 50

    -- Daily quality
    WHEN p_code = 'q_score_600'   THEN 40
    WHEN p_code = 'q_score_750_2' THEN 55
    WHEN p_code = 'q_score_850'   THEN 60

    -- Daily variety
    WHEN p_code = 'q_games_2' THEN 30
    WHEN p_code = 'q_games_3' THEN 40
    WHEN p_code = 'q_games_4' THEN 50

    -- Per-game quests
    WHEN p_code IN (
      'q_play_schulte_2',
      'q_play_sudoku_2',
      'q_play_stroop_2',
      'q_play_reaction_2',
      'q_play_memory_2',
      'q_play_nback_2',
      'q_play_math_2',
      'q_play_gonogo_2',
      'q_play_mental_2',
      'q_play_corsi_2',
      'q_play_trail_2'
    ) THEN 30

    -- Weekly
    WHEN p_code = 'w_rounds_25'   THEN 120
    WHEN p_code = 'w_games_7'     THEN 120
    WHEN p_code = 'w_score_800_5' THEN 150
    WHEN p_code = 'w_score_900_3' THEN 180

    ELSE 0
  END;
$function$;

REVOKE ALL ON FUNCTION public.quest_xp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quest_xp(text) TO authenticated, service_role;

-- 3. CHỈ GIỮ MỘT TRIGGER GHI total_xp
CREATE OR REPLACE FUNCTION public.apply_xp_event_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_total bigint;
  v_new_total bigint;
BEGIN
  IF COALESCE(NEW.xp_awarded, 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.total_xp, 0)
  INTO v_old_total
  FROM public.profiles AS p
  WHERE p.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for XP event'
      USING ERRCODE = '23503';
  END IF;

  v_new_total := LEAST(
    200000000::bigint,
    GREATEST(
      0::bigint,
      v_old_total + NEW.xp_awarded::bigint
    )
  );

  PERFORM pg_catalog.set_config(
    'gamification.is_xp_trigger',
    'true',
    true
  );

  UPDATE public.profiles
  SET
    total_xp = v_new_total,
    level = GREATEST(
      1,
      FLOOR(
        (
          -1 + SQRT(
            1 + v_new_total::numeric / 12.5
          )
        ) / 2
      )::integer + 1
    )
  WHERE id = NEW.user_id;

  PERFORM pg_catalog.set_config(
    'gamification.is_xp_trigger',
    'false',
    true
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_xp_events_apply ON public.xp_events;
DROP TRIGGER IF EXISTS trg_apply_xp_event ON public.xp_events;

CREATE TRIGGER trg_xp_events_apply
AFTER INSERT ON public.xp_events
FOR EACH ROW
EXECUTE FUNCTION public.apply_xp_event_to_profile();

REVOKE ALL ON FUNCTION public.apply_xp_event_to_profile() FROM PUBLIC;

-- 4. CLAIM QUEST ATOMIC + IDEMPOTENT
CREATE OR REPLACE FUNCTION public.claim_quest(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_code text := btrim(COALESCE(p_code, ''));
  v_today date :=
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_week date :=
    date_trunc(
      'week',
      CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::date;

  v_period text;
  v_source_key text;
  v_row record;
  v_xp integer;
  v_total bigint;
  v_claimed_code text;
  v_event_rows integer := 0;
  v_awarded integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Quest code is required'
      USING ERRCODE = '22023';
  END IF;

  v_period := CASE
    WHEN left(v_code, 2) = 'w_' THEN v_week::text
    ELSE v_today::text
  END;

  v_source_key :=
    'quest:' || v_code || ':' || v_period;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user::text || ':quest',
      0
    )
  );

  SELECT q.*
  INTO v_row
  FROM public.get_daily_quests() AS q
  WHERE q.code = v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive quest';
  END IF;

  IF COALESCE(v_row.claimed, false) THEN
    SELECT COALESCE(p.total_xp, 0)
    INTO v_total
    FROM public.profiles AS p
    WHERE p.id = v_user;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    RETURN jsonb_build_object(
      'code', v_code,
      'xpAwarded', 0,
      'totalXp', v_total,
      'alreadyClaimed', true
    );
  END IF;

  IF v_row.progress < v_row.goal THEN
    RAISE EXCEPTION 'Quest not completed';
  END IF;

  v_xp := public.quest_xp(v_code);

  IF COALESCE(v_xp, 0) <= 0 THEN
    RAISE EXCEPTION
      'Quest is not configured for %',
      v_code;
  END IF;

  INSERT INTO public.user_quests AS uq (
    user_id,
    period_key,
    code,
    claimed,
    progress
  )
  VALUES (
    v_user,
    v_period,
    v_code,
    true,
    v_row.progress
  )
  ON CONFLICT (user_id, code, period_key)
  DO UPDATE SET
    claimed = true,
    progress = GREATEST(
      uq.progress,
      EXCLUDED.progress
    )
  WHERE uq.claimed = false
  RETURNING code INTO v_claimed_code;

  IF v_claimed_code IS NULL THEN
    SELECT COALESCE(p.total_xp, 0)
    INTO v_total
    FROM public.profiles AS p
    WHERE p.id = v_user;

    RETURN jsonb_build_object(
      'code', v_code,
      'xpAwarded', 0,
      'totalXp', COALESCE(v_total, 0),
      'alreadyClaimed', true
    );
  END IF;

  INSERT INTO public.xp_events (
    user_id,
    game,
    round_score,
    xp_awarded,
    source_key
  )
  VALUES (
    v_user,
    'quest',
    0,
    v_xp,
    v_source_key
  )
  ON CONFLICT (user_id, source_key)
  WHERE source_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  v_awarded := CASE
    WHEN v_event_rows = 1 THEN v_xp
    ELSE 0
  END;

  SELECT COALESCE(p.total_xp, 0)
  INTO v_total
  FROM public.profiles AS p
  WHERE p.id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'code', v_code,
    'xpAwarded', v_awarded,
    'totalXp', v_total,
    'alreadyClaimed', v_event_rows = 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_quest(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quest(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

---

## 3. TRUY VẤN KIỂM TRA REMOTE TRƯỚC & SAU KHI SỬA

```sql
-- 1. Kiểm tra source_key và index
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'xp_events'
  AND column_name = 'source_key';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'xp_events'
  AND indexdef ILIKE '%source_key%';

-- 2. Kiểm tra chỉ có duy nhất 1 trigger cộng XP
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.xp_events'::regclass
  AND NOT tgisinternal;

-- 3. Kiểm tra xem có quest nào thiếu cấu hình phần thưởng không
SELECT code, xp_reward
FROM public.get_daily_quests()
WHERE COALESCE(xp_reward, 0) <= 0;
```

---

## 4. MÃ NGUỒN CHI TIẾT TẤT CẢ CÁC FILE LIÊN QUAN


### 📄 src/app/components/quests-panel.tsx (Frontend UI Component (Quests Panel))

```typescript
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Gift, Target } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";
import { claimQuest, fetchDailyQuests, type DailyQuest } from "../lib/api";
import { logError } from "../lib/logger";
import { resolveQuestLabel } from "../lib/quest-labels";

// Tiến độ do Postgres tính từ training_sessions theo giờ Việt Nam.
// 3 daily xoay mỗi ngày + 3 weekly; client chỉ hiển thị và xin nhận thưởng.

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-ink-rgb),0.55)",
  border: "1px solid rgba(var(--neuro-green-rgb),0.16)",
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
};

const TXT = {
  vi: {
    title: "NHIỆM VỤ",
    sub: "Nhiệm vụ ngày làm mới 00:00 · nhiệm vụ tuần làm mới thứ Hai (GMT+7)",
    daily: "HÔM NAY",
    weekly: "TUẦN NÀY",
    claim: "NHẬN",
    claimed: "ĐÃ NHẬN",
    done: "đã nhận",
    loading: "Đang tải…",
    got: (xp: number) => `Đã nhận +${xp} XP`,
  },
  en: {
    title: "QUESTS",
    sub: "Daily resets at 00:00 · weekly resets Monday (GMT+7)",
    daily: "TODAY",
    weekly: "THIS WEEK",
    claim: "CLAIM",
    claimed: "CLAIMED",
    done: "claimed",
    loading: "Loading…",
    got: (xp: number) => `Claimed +${xp} XP`,
  },
};

function QuestRow({
  quest,
  lang,
  busy,
  onClaim,
}: {
  quest: DailyQuest;
  lang: "vi" | "en";
  busy: string | null;
  onClaim: (code: string) => void;
}) {
  const s = TXT[lang];
  const pct = Math.min(100, (quest.progress / Math.max(1, quest.goal)) * 100);
  const ready = quest.progress >= quest.goal && !quest.claimed;
  // Mot nguon duy nhat cho nhan nhiem vu: resolveQuestLabel tra cuu
  // QUEST_LABELS roi moi humanize, dung thu tu ma lib da dinh nghia va
  // tests/quest-labels.test.ts da khoa. Truoc day panel giu ban sao rieng
  // cua ca bang nhan lan ham humanize; ban sao do lech 50/250 phep thu:
  // thieu corsi + trail nen hien id tho, tra chuoi rong voi ma "q_", va
  // NEM TypeError neu RPC tra code null.
  // Uu tien 1: nhan do server viet (title_vi/title_en tu migration 20260828)
  // — doi ten nhiem vu trong database la giao dien doi theo, khoi build lai.
  // Thu tu day du (server -> QUEST_LABELS -> humanize -> "Nhiem vu") da duoc
  // tests/quest-labels.test.ts khoa san (xem nhom "thu tu uu tien").
  const label = resolveQuestLabel(
    quest.code,
    lang,
    lang === "vi" ? quest.title_vi : quest.title_en,
  );

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: quest.claimed
          ? "rgba(var(--neuro-green-rgb),0.08)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          ready
            ? "rgba(var(--neuro-green-rgb),0.5)"
            : quest.claimed
              ? "rgba(var(--neuro-green-rgb),0.25)"
              : "rgba(255,255,255,0.07)"
        }`,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs text-foreground/85">{label}</span>
        <span className="text-xs shrink-0" style={{ color: "#F59E0B" }}>
          +{quest.xp_reward} XP
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg,#10B981,#00D4FF)",
            }}
          />
        </div>
        <span
          className="text-xs w-14 text-right"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {quest.progress}/{quest.goal}
        </span>
        {quest.claimed ? (
          <span
            className="text-xs flex items-center gap-1 w-20 justify-end"
            style={{ color: "#10B981" }}
          >
            <CheckCircle2 size={11} /> {s.claimed}
          </span>
        ) : (
          <button
            type="button"
            disabled={!ready || busy === quest.code}
            onClick={() => onClaim(quest.code)}
            className="text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 w-20 justify-center transition-all"
            style={{
              opacity: ready ? 1 : 0.35,
              cursor: ready ? "pointer" : "not-allowed",
              background: "rgba(var(--neuro-green-rgb),0.15)",
              border: "1px solid rgba(var(--neuro-green-rgb),0.45)",
              color: "#10B981",
            }}
          >
            <Gift size={11} /> {s.claim}
          </button>
        )}
      </div>
    </div>
  );
}

export function QuestsPanel({
  refreshKey = 0,
  onClaimed,
}: {
  refreshKey?: number;
  onClaimed?: () => void;
}) {
  const { lang } = useLang();
  const s = TXT[lang];
  const [quests, setQuests] = useState<DailyQuest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuests(await fetchDailyQuests());
    } catch (err) {
      logError("Fetch quests failed:", err);
      setQuests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const claim = async (code: string) => {
    setBusy(code);
    try {
      const res = await claimQuest(code);
      if (res.alreadyClaimed) {
        toast.info(s.claimed);
      } else {
        toast.success(s.got(res.xpAwarded));
      }
      await load();
      onClaimed?.();
    } catch (err) {
      logError("Claim quest failed:", err);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const daily = (quests ?? []).filter((q) => !q.code.startsWith("w_"));
  const weekly = (quests ?? []).filter((q) => q.code.startsWith("w_"));
  const completed = (quests ?? []).filter((q) => q.claimed).length;

  return (
    <div className="rounded-2xl p-5" style={panelStyle}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: "#10B981" }} />
          <span className="text-xs tracking-[0.25em] uppercase text-foreground font-mono">
            {s.title}
          </span>
        </div>
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: "#10B981" }}
        >
          {completed}/{(quests ?? []).length} {s.done}
        </span>
      </div>
      <p className="text-xs text-foreground/40 mb-4">{s.sub}</p>

      {quests === null ? (
        <div className="text-xs text-foreground/40 py-6 text-center">
          {s.loading}
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2 text-xs tracking-[0.18em] text-emerald-400/80 font-mono">
              <Target size={12} /> {s.daily}
            </div>
            <div className="space-y-2.5">
              {daily.map((q) => (
                <QuestRow
                  key={q.code}
                  quest={q}
                  lang={lang}
                  busy={busy}
                  onClaim={claim}
                />
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-2 text-xs tracking-[0.18em] text-cyan-400/80 font-mono">
              <CalendarDays size={12} /> {s.weekly}
            </div>
            <div className="space-y-2.5">
              {weekly.map((q) => (
                <QuestRow
                  key={q.code}
                  quest={q}
                  lang={lang}
                  busy={busy}
                  onClaim={claim}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

```

---

### 📄 src/app/lib/api/gamification.ts (Frontend Gamification API Client (claimQuest & fetchDailyQuests))

```typescript
/**
 * Achievements and daily quests.
 */
import { getSupabase, currentUserId } from "./internal";

// ─── Giai đoạn 5: thành tựu, nhiệm vụ ngày, bạn bè ────────────────────────
// Mọi điều kiện mở khoá và phần thưởng XP đều được tính lại trong Postgres.
// Trình duyệt chỉ đọc kết quả, không bao giờ tự khai báo đã hoàn thành.

export type AchievementUnlock = {
  code: string;
  unlocked_at: string;
  newly_unlocked: boolean;
};

/**
 * Xét lại toàn bộ thành tựu từ dữ liệu thật và trả về danh sách đã mở khoá.
 * `newly_unlocked` đánh dấu những cái vừa mở trong lần gọi này để hiện hiệu ứng.
 */
export async function syncAchievements(): Promise<AchievementUnlock[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("sync_achievements");
  if (error) throw new Error(`Sync achievements failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    code: String(row.code ?? ""),
    unlocked_at: String(row.unlocked_at ?? ""),
    newly_unlocked: Boolean(row.newly_unlocked),
  }));
}

export type AchievementProgress = {
  code: string;
  progress: number;
  goal: number;
  unlocked: boolean;
};

/**
 * Tiến độ từng thành tựu để vẽ thanh progress.
 * Server tính từ cùng một nguồn thống kê với sync_achievements, nên
 * "progress đạt goal" luôn trùng với "đã mở khoá" sau lần đồng bộ gần nhất.
 */
export async function fetchAchievementProgress(): Promise<
  AchievementProgress[]
> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_achievement_progress");
  if (error)
    throw new Error(`Fetch achievement progress failed: ${error.message}`);

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: AchievementProgress[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const goal = Number(row.goal ?? 1);
    out.push({
      code: String(row.code ?? ""),
      progress: Number(row.progress ?? 0),
      goal: goal > 0 ? goal : 1,
      unlocked: Boolean(row.unlocked),
    });
  }
  return out;
}

export type DailyQuest = {
  code: string;
  progress: number;
  goal: number;
  xp_reward: number;
  claimed: boolean;
  /** Nhãn tiếng Việt từ Postgres (migration 20260828+). Có thể rỗng nếu RPC cũ. */
  title_vi?: string;
  /** Nhãn English từ Postgres (migration 20260828+). Có thể rỗng nếu RPC cũ. */
  title_en?: string;
};

/** Tiến độ nhiệm vụ hôm nay, mốc ngày theo giờ Việt Nam. */
export async function fetchDailyQuests(): Promise<DailyQuest[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await getSupabase().rpc("get_daily_quests");
  if (error) throw new Error(`Fetch daily quests failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    code: String(row.code ?? ""),
    progress: Number(row.progress ?? 0),
    goal: Number(row.goal ?? 1),
    xp_reward: Number(row.xp_reward ?? 0),
    claimed: Boolean(row.claimed),
    title_vi: row.title_vi != null ? String(row.title_vi) : undefined,
    title_en: row.title_en != null ? String(row.title_en) : undefined,
  }));
}

export type ClaimQuestResult = {
  code: string;
  xpAwarded: number;
  totalXp: number;
  alreadyClaimed: boolean;
};

/** Nhận thưởng một nhiệm vụ. Server tự kiểm tra đủ điều kiện và chưa nhận. */
export async function claimQuest(
  code: string,
): Promise<ClaimQuestResult> {
  const { data, error } = await getSupabase().rpc("claim_quest", {
    p_code: code,
  });
  if (error) throw new Error(`Claim quest failed: ${error.message}`);

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    code: String(row.code ?? code),
    xpAwarded: Number(row.xpAwarded ?? 0),
    totalXp: Number(row.totalXp ?? 0),
    alreadyClaimed: Boolean(row.alreadyClaimed),
  };
}

```

---

### 📄 src/app/lib/quest-labels.ts (Frontend Quest Definitions & Localized Labels)

```typescript
/**
 * Nhãn nhiệm vụ — nguồn duy nhất phía client.
 *
 * Postgres chỉ trả `code` kỹ thuật (vd. w_games_7). Giao diện KHÔNG BAO GIỜ
 * được hiện mã thô đó. Thứ tự ưu tiên khi vẽ tên:
 *   1. title_vi / title_en từ RPC (nếu có)
 *   2. QUEST_LABELS[code][lang]
 *   3. humanizeQuestCode(code, lang) — dịch từ cấu trúc mã
 *   4. chuỗi an toàn "Nhiệm vụ" / "Quest" (không bao giờ trả lại code)
 */

import { GAME_REGISTRY } from "./game-registry";

export type QuestLang = "vi" | "en";

export const QUEST_LABELS: Record<string, { vi: string; en: string }> = {
  q_rounds_3: { vi: "Khởi động: chơi 3 ván", en: "Warm up: play 3 rounds" },
  q_rounds_5: { vi: "Chơi 5 ván hôm nay", en: "Play 5 rounds today" },
  q_rounds_7: { vi: "Bền bỉ: chơi 7 ván", en: "Endurance: play 7 rounds" },
  q_score_600: { vi: "Đạt 600+ trong một ván", en: "Score 600+ in one round" },
  q_score_750_2: { vi: "Đạt 750+ trong 2 ván", en: "Score 750+ in 2 rounds" },
  q_score_850: { vi: "Đạt 850+ trong một ván", en: "Score 850+ in one round" },
  q_games_2: { vi: "Chơi 2 trò khác nhau", en: "Play 2 different games" },
  q_games_3: { vi: "Chơi 3 trò khác nhau", en: "Play 3 different games" },
  q_games_4: { vi: "Chơi 4 trò khác nhau", en: "Play 4 different games" },
  q_play_schulte_2: { vi: "Chơi Schulte 2 ván", en: "Play 2 Schulte rounds" },
  q_play_sudoku_2: { vi: "Chơi Sudoku 2 ván", en: "Play 2 Sudoku rounds" },
  q_play_stroop_2: { vi: "Chơi Stroop 2 ván", en: "Play 2 Stroop rounds" },
  q_play_reaction_2: {
    vi: "Chơi Reaction 2 ván",
    en: "Play 2 Reaction rounds",
  },
  q_play_memory_2: { vi: "Chơi Memory 2 ván", en: "Play 2 Memory rounds" },
  q_play_nback_2: { vi: "Chơi N-Back 2 ván", en: "Play 2 N-Back rounds" },
  q_play_math_2: {
    vi: "Chơi Math Sprint 2 ván",
    en: "Play 2 Math Sprint rounds",
  },
  q_play_gonogo_2: {
    vi: "Chơi Go / No-Go 2 ván",
    en: "Play 2 Go / No-Go rounds",
  },
  q_play_mental_2: {
    vi: "Chơi Mental Rotation 2 ván",
    en: "Play 2 Mental Rotation rounds",
  },
  w_rounds_25: {
    vi: "Tuần: hoàn thành 25 ván",
    en: "Weekly: finish 25 rounds",
  },
  w_games_7: {
    vi: "Tuần: chơi 7 trò khác nhau",
    en: "Weekly: play 7 different games",
  },
  w_score_800_5: { vi: "Tuần: 5 ván đạt 800+", en: "Weekly: 5 rounds at 800+" },
  w_score_900_3: {
    vi: "Tuần elite: 3 ván đạt 900+",
    en: "Elite week: 3 rounds at 900+",
  },
};

const QUEST_GAME_NAMES: Record<string, string> = Object.fromEntries(
  GAME_REGISTRY.map((game) => [game.id, game.title]),
);

/** Dịch mã nhiệm vụ thành câu đọc được từ cấu trúc mã. */
export function humanizeQuestCode(code: string, lang: QuestLang): string {
  const raw = String(code ?? "").trim();
  if (!raw) return lang === "vi" ? "Nhiệm vụ" : "Quest";

  const weekly = raw.startsWith("w_");
  const body = raw.replace(/^[qw]_/, "");
  const prefix = weekly ? (lang === "vi" ? "Tuần: " : "Weekly: ") : "";

  let text: string | null = null;
  let m: RegExpMatchArray | null;

  if ((m = body.match(/^rounds_(\d+)$/))) {
    text = lang === "vi" ? `chơi ${m[1]} ván` : `play ${m[1]} rounds`;
  } else if ((m = body.match(/^score_(\d+)_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong ${m[2]} ván`
        : `score ${m[1]}+ in ${m[2]} rounds`;
  } else if ((m = body.match(/^score_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong một ván`
        : `score ${m[1]}+ in one round`;
  } else if ((m = body.match(/^games_(\d+)$/))) {
    text =
      lang === "vi"
        ? `chơi ${m[1]} trò khác nhau`
        : `play ${m[1]} different games`;
  } else if ((m = body.match(/^play_([a-z]+)_(\d+)$/))) {
    const game = QUEST_GAME_NAMES[m[1]] ?? m[1];
    text =
      lang === "vi"
        ? `chơi ${game} ${m[2]} ván`
        : `play ${m[2]} ${game} rounds`;
  }

  if (!text) {
    // Bỏ gạch dưới; nếu vẫn giống mã kỹ thuật thì dùng nhãn generic.
    const soft = body.replace(/_/g, " ").trim();
    if (
      !soft ||
      (/^[a-z0-9 ]+$/i.test(soft) && /\d/.test(soft) && soft.length < 4)
    ) {
      text = lang === "vi" ? "nhiệm vụ" : "quest";
    } else {
      text = soft || (lang === "vi" ? "nhiệm vụ" : "quest");
    }
  }

  const label = (prefix + text).trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Nhãn hiển thị cuối cùng — không bao giờ trả về mã thô.
 * serverTitle: title_vi/title_en từ RPC (tuỳ ngôn ngữ).
 */
export function resolveQuestLabel(
  code: string,
  lang: QuestLang,
  serverTitle?: string | null,
): string {
  const fromServer = String(serverTitle ?? "").trim();
  if (fromServer && fromServer !== code) return fromServer;

  const mapped = QUEST_LABELS[code]?.[lang];
  if (mapped) return mapped;

  const human = humanizeQuestCode(code, lang);
  // Chặn trường hợp humanize vô tình trả lại đúng mã.
  if (human && human !== code) return human;

  return lang === "vi" ? "Nhiệm vụ" : "Quest";
}

```

---

### 📄 supabase/migrations/20260930000001_fix_claim_quest.sql (Roll-Forward SQL Migration (Fix claim_quest, XP dictionary, Idempotency))

```sql
﻿-- ==============================================================================
-- 20260930000001_fix_claim_quest.sql
-- Fix claim_quest RPC: Full quest_xp dictionary, single ledger trigger, idempotent claim
-- ==============================================================================

SET lock_timeout = '2s';

BEGIN;

-- =============================================================================
-- 1. SCHEMA CHO IDEMPOTENCY
-- =============================================================================

ALTER TABLE public.xp_events
ADD COLUMN IF NOT EXISTS source_key text;

-- Không được tạo unique index nếu dữ liệu hiện có đã trùng.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.xp_events
    WHERE source_key IS NOT NULL
    GROUP BY user_id, source_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate xp_events (user_id, source_key) must be resolved first';
  END IF;
END;
$check$;

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_source_key_uq
ON public.xp_events(user_id, source_key)
WHERE source_key IS NOT NULL;

-- =============================================================================
-- 2. ĐỊNH NGHĨA THƯỞNG CHO TẤT CẢ QUEST ĐANG HOẠT ĐỘNG
-- =============================================================================

CREATE OR REPLACE FUNCTION public.quest_xp(p_code text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE
    -- Daily volume
    WHEN p_code = 'q_rounds_3' THEN 30
    WHEN p_code = 'q_rounds_5' THEN 40
    WHEN p_code = 'q_rounds_7' THEN 50

    -- Daily quality
    WHEN p_code = 'q_score_600'   THEN 40
    WHEN p_code = 'q_score_750_2' THEN 55
    WHEN p_code = 'q_score_850'   THEN 60

    -- Daily variety
    WHEN p_code = 'q_games_2' THEN 30
    WHEN p_code = 'q_games_3' THEN 40
    WHEN p_code = 'q_games_4' THEN 50

    -- Per-game quests
    WHEN p_code IN (
      'q_play_schulte_2',
      'q_play_sudoku_2',
      'q_play_stroop_2',
      'q_play_reaction_2',
      'q_play_memory_2',
      'q_play_nback_2',
      'q_play_math_2',
      'q_play_gonogo_2',
      'q_play_mental_2',
      'q_play_corsi_2',
      'q_play_trail_2'
    ) THEN 30

    -- Weekly
    WHEN p_code = 'w_rounds_25'   THEN 120
    WHEN p_code = 'w_games_7'     THEN 120
    WHEN p_code = 'w_score_800_5' THEN 150
    WHEN p_code = 'w_score_900_3' THEN 180

    ELSE 0
  END;
$function$;

REVOKE ALL
ON FUNCTION public.quest_xp(text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.quest_xp(text)
TO authenticated, service_role;

-- =============================================================================
-- 3. CHỈ GIỮ MỘT TRIGGER GHI total_xp
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_xp_event_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_total bigint;
  v_new_total bigint;
BEGIN
  IF COALESCE(NEW.xp_awarded, 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.total_xp, 0)
  INTO v_old_total
  FROM public.profiles AS p
  WHERE p.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for XP event'
      USING ERRCODE = '23503';
  END IF;

  v_new_total := LEAST(
    200000000::bigint,
    GREATEST(
      0::bigint,
      v_old_total + NEW.xp_awarded::bigint
    )
  );

  -- Cho phép đúng trigger ledger thay đổi total_xp.
  PERFORM pg_catalog.set_config(
    'gamification.is_xp_trigger',
    'true',
    true
  );

  UPDATE public.profiles
  SET
    total_xp = v_new_total,
    level = GREATEST(
      1,
      FLOOR(
        (
          -1 + SQRT(
            1 + v_new_total::numeric / 12.5
          )
        ) / 2
      )::integer + 1
    )
  WHERE id = NEW.user_id;

  PERFORM pg_catalog.set_config(
    'gamification.is_xp_trigger',
    'false',
    true
  );

  RETURN NEW;
END;
$function$;

-- Xóa cả tên trigger cũ và tên trigger mới nếu đã tồn tại.
DROP TRIGGER IF EXISTS trg_xp_events_apply
ON public.xp_events;

DROP TRIGGER IF EXISTS trg_apply_xp_event
ON public.xp_events;

CREATE TRIGGER trg_xp_events_apply
AFTER INSERT ON public.xp_events
FOR EACH ROW
EXECUTE FUNCTION public.apply_xp_event_to_profile();

REVOKE ALL
ON FUNCTION public.apply_xp_event_to_profile()
FROM PUBLIC;

-- =============================================================================
-- 4. CLAIM QUEST ATOMIC + IDEMPOTENT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_quest(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_code text := btrim(COALESCE(p_code, ''));
  v_today date :=
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_week date :=
    date_trunc(
      'week',
      CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::date;

  v_period text;
  v_source_key text;
  v_row record;
  v_xp integer;
  v_total bigint;
  v_claimed_code text;
  v_event_rows integer := 0;
  v_awarded integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Quest code is required'
      USING ERRCODE = '22023';
  END IF;

  v_period := CASE
    WHEN left(v_code, 2) = 'w_' THEN v_week::text
    ELSE v_today::text
  END;

  v_source_key :=
    'quest:' || v_code || ':' || v_period;

  -- Serialise mọi claim của cùng một user.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user::text || ':quest',
      0
    )
  );

  -- Luôn kiểm tra điều kiện bằng dữ liệu server.
  SELECT q.*
  INTO v_row
  FROM public.get_daily_quests() AS q
  WHERE q.code = v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive quest';
  END IF;

  -- Retry sau khi request trước đã thành công:
  -- trả success idempotent, không thưởng lại.
  IF COALESCE(v_row.claimed, false) THEN
    SELECT COALESCE(p.total_xp, 0)
    INTO v_total
    FROM public.profiles AS p
    WHERE p.id = v_user;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    RETURN jsonb_build_object(
      'code', v_code,
      'xpAwarded', 0,
      'totalXp', v_total,
      'alreadyClaimed', true
    );
  END IF;

  IF v_row.progress < v_row.goal THEN
    RAISE EXCEPTION 'Quest not completed';
  END IF;

  v_xp := public.quest_xp(v_code);

  IF COALESCE(v_xp, 0) <= 0 THEN
    RAISE EXCEPTION
      'Quest is not configured for %',
      v_code;
  END IF;

  -- Chỉ update row nếu trước đó chưa claimed.
  INSERT INTO public.user_quests AS uq (
    user_id,
    period_key,
    code,
    claimed,
    progress
  )
  VALUES (
    v_user,
    v_period,
    v_code,
    true,
    v_row.progress
  )
  ON CONFLICT (user_id, code, period_key)
  DO UPDATE SET
    claimed = true,
    progress = GREATEST(
      uq.progress,
      EXCLUDED.progress
    )
  WHERE uq.claimed = false
  RETURNING code INTO v_claimed_code;

  -- Một request khác đã claim trước.
  IF v_claimed_code IS NULL THEN
    SELECT COALESCE(p.total_xp, 0)
    INTO v_total
    FROM public.profiles AS p
    WHERE p.id = v_user;

    RETURN jsonb_build_object(
      'code', v_code,
      'xpAwarded', 0,
      'totalXp', COALESCE(v_total, 0),
      'alreadyClaimed', true
    );
  END IF;

  -- Ledger event duy nhất cho quest + period này.
  INSERT INTO public.xp_events (
    user_id,
    game,
    round_score,
    xp_awarded,
    source_key
  )
  VALUES (
    v_user,
    'quest',
    0,
    v_xp,
    v_source_key
  )
  ON CONFLICT (user_id, source_key)
  WHERE source_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  v_awarded := CASE
    WHEN v_event_rows = 1 THEN v_xp
    ELSE 0
  END;

  -- Trigger ledger đã cập nhật total_xp.
  SELECT COALESCE(p.total_xp, 0)
  INTO v_total
  FROM public.profiles AS p
  WHERE p.id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'code', v_code,
    'xpAwarded', v_awarded,
    'totalXp', v_total,
    'alreadyClaimed', v_event_rows = 0
  );
END;
$function$;

REVOKE ALL
ON FUNCTION public.claim_quest(text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.claim_quest(text)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

```

---

### 📄 supabase/migrations/20260910000009_phase10_xp_inflation_quests.sql (Database Migration (user_quests Table & claim_quest RPC))

```sql
-- 20260910000009_phase10_xp_inflation_quests.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. Epoch-aware uniqueness for achievements
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS epoch timestamptz NOT NULL DEFAULT '-infinity',
  DROP CONSTRAINT IF EXISTS user_achievements_pkey CASCADE,
  ADD PRIMARY KEY (user_id, code, epoch);

-- Update sync_achievements_for to use the current stats_epoch
CREATE OR REPLACE FUNCTION public.sync_achievements_for(p_user uuid)
RETURNS TABLE (code text, unlocked_at timestamptz, newly_unlocked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := p_user;
  v jsonb;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
  v_epoch timestamptz;
  n_rounds bigint;
  n_streak integer;
  n_level integer;
  n_days bigint;
  n_maxax integer;
  n_minax integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT stats_epoch INTO v_epoch FROM public.profiles WHERE id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v := public.achievement_stats(v_user);

  n_rounds := (v->>'rounds')::bigint;
  n_streak := (v->>'streak')::int;
  n_level  := (v->>'level')::int;
  n_days   := (v->>'days')::bigint;
  n_maxax  := (v->>'max_axis')::int;
  n_minax  := (v->>'min_axis')::int;

  -- volume
  IF n_rounds >= 1    THEN v_new := v_new || 'first_round'::text; END IF;
  IF n_rounds >= 10   THEN v_new := v_new || 'rounds_10'::text;   END IF;
  IF n_rounds >= 50   THEN v_new := v_new || 'rounds_50'::text;   END IF;
  IF n_rounds >= 100  THEN v_new := v_new || 'rounds_100'::text;  END IF;
  IF n_rounds >= 250  THEN v_new := v_new || 'rounds_250'::text;  END IF;
  IF n_rounds >= 500  THEN v_new := v_new || 'rounds_500'::text;  END IF;
  IF n_rounds >= 1000 THEN v_new := v_new || 'rounds_1000'::text; END IF;

  -- streak
  IF n_streak >= 3   THEN v_new := v_new || 'streak_3'::text;   END IF;
  IF n_streak >= 7   THEN v_new := v_new || 'streak_7'::text;   END IF;
  IF n_streak >= 14  THEN v_new := v_new || 'streak_14'::text;  END IF;
  IF n_streak >= 30  THEN v_new := v_new || 'streak_30'::text;  END IF;
  IF n_streak >= 60  THEN v_new := v_new || 'streak_60'::text;  END IF;
  IF n_streak >= 100 THEN v_new := v_new || 'streak_100'::text; END IF;
  IF n_days   >= 60  THEN v_new := v_new || 'days_60'::text;    END IF;

  -- level / xp
  IF n_level >= 5  THEN v_new := v_new || 'level_5'::text;  END IF;
  IF n_level >= 10 THEN v_new := v_new || 'level_10'::text; END IF;
  IF n_level >= 20 THEN v_new := v_new || 'level_20'::text; END IF;
  IF n_level >= 30 THEN v_new := v_new || 'level_30'::text; END IF;
  IF n_level >= 50 THEN v_new := v_new || 'level_50'::text; END IF;
  IF (v->>'total_xp')::bigint >= 10000 THEN v_new := v_new || 'xp_10000'::text; END IF;

  -- mastery
  IF n_maxax >= 500 THEN v_new := v_new || 'axis_500'::text; END IF;
  IF n_maxax >= 800 THEN v_new := v_new || 'axis_800'::text; END IF;
  IF n_maxax >= 900 THEN v_new := v_new || 'axis_900'::text; END IF;
  IF n_maxax >= 950 THEN v_new := v_new || 'axis_950'::text; END IF;
  IF n_minax >= 500 THEN v_new := v_new || 'all_axes_500'::text; END IF;
  IF n_minax >= 700 THEN v_new := v_new || 'all_axes_700'::text; END IF;
  IF n_minax >= 850 THEN v_new := v_new || 'all_axes_850'::text; END IF;

  -- breadth (9 game)
  IF (v->>'games')::int     >= 9 THEN v_new := v_new || 'all_games'::text;     END IF;
  IF (v->>'games_10')::int  >= 9 THEN v_new := v_new || 'all_games_10'::text;  END IF;
  IF (v->>'games_600')::int >= 9 THEN v_new := v_new || 'all_games_600'::text; END IF;

  -- score
  IF (v->>'best')::int >= 900 THEN v_new := v_new || 'score_900'::text; END IF;
  IF (v->>'best')::int >= 950 THEN v_new := v_new || 'score_950'::text; END IF;
  IF (v->>'best')::int >= 990 THEN v_new := v_new || 'score_990'::text; END IF;
  IF (v->>'perfect')::int >= 10 THEN v_new := v_new || 'perfect_10'::text; END IF;

  -- per game
  IF (v->>'b_schulte')::int  >= 700 THEN v_new := v_new || 'schulte_700'::text;  END IF;
  IF (v->>'b_schulte')::int  >= 900 THEN v_new := v_new || 'schulte_900'::text;  END IF;
  IF (v->>'b_sudoku')::int   >= 700 THEN v_new := v_new || 'sudoku_700'::text;   END IF;
  IF (v->>'b_sudoku')::int   >= 900 THEN v_new := v_new || 'sudoku_900'::text;   END IF;
  IF (v->>'b_stroop')::int   >= 700 THEN v_new := v_new || 'stroop_700'::text;   END IF;
  IF (v->>'b_stroop')::int   >= 900 THEN v_new := v_new || 'stroop_900'::text;   END IF;
  IF (v->>'b_reaction')::int >= 700 THEN v_new := v_new || 'reaction_700'::text; END IF;
  IF (v->>'b_reaction')::int >= 900 THEN v_new := v_new || 'reaction_900'::text; END IF;
  IF (v->>'b_memory')::int   >= 700 THEN v_new := v_new || 'memory_700'::text;   END IF;
  IF (v->>'b_memory')::int   >= 900 THEN v_new := v_new || 'memory_900'::text;   END IF;
  IF (v->>'b_nback')::int    >= 700 THEN v_new := v_new || 'nback_ace'::text;    END IF;
  IF (v->>'b_nback')::int    >= 900 THEN v_new := v_new || 'nback_900'::text;    END IF;
  IF (v->>'b_math')::int     >= 700 THEN v_new := v_new || 'math_700'::text;     END IF;
  IF (v->>'b_math')::int     >= 900 THEN v_new := v_new || 'math_900'::text;     END IF;
  IF (v->>'b_gonogo')::int   >= 700 THEN v_new := v_new || 'gonogo_700'::text;   END IF;
  IF (v->>'b_gonogo')::int   >= 900 THEN v_new := v_new || 'gonogo_900'::text;   END IF;
  IF (v->>'b_mental')::int   >= 700 THEN v_new := v_new || 'mental_700'::text;   END IF;
  IF (v->>'b_mental')::int   >= 900 THEN v_new := v_new || 'mental_900'::text;   END IF;

  -- dac biet
  IF (v->>'schulte_6x6')::boolean    THEN v_new := v_new || 'schulte_6x6'::text;    END IF;
  IF (v->>'sudoku_extreme')::boolean THEN v_new := v_new || 'sudoku_extreme'::text; END IF;
  IF (v->>'nback_deep')::boolean     THEN v_new := v_new || 'nback_deep'::text;     END IF;

  FOREACH v_code IN ARRAY v_new LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_achievements a
      WHERE a.user_id = v_user AND a.code = v_code AND a.epoch = COALESCE(v_epoch, '-infinity')
    ) THEN
      INSERT INTO public.user_achievements(user_id, code, epoch) VALUES (v_user, v_code, COALESCE(v_epoch, '-infinity'));
      v_xp := least(greatest(coalesce(public.achievement_xp(v_code), 0), 0), 1000);
      IF v_xp > 0 THEN
        INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key)
        VALUES (v_user, 'achievement', 0, v_xp, 'achievement_' || v_code);
        UPDATE public.profiles SET total_xp = coalesce(total_xp,0) + v_xp
        WHERE id = v_user;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT a.code, a.unlocked_at, (a.unlocked_at > now() - interval '10 seconds')
    FROM public.user_achievements a
    WHERE a.user_id = v_user AND a.epoch = COALESCE(v_epoch, '-infinity')
    ORDER BY a.unlocked_at DESC;
END;
$$;

-- 2. Chốt MỘT bảng quest duy nhất
CREATE TABLE IF NOT EXISTS public.user_quests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  progress int NOT NULL DEFAULT 0,
  period_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, code, period_key)
);

ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_quests_select_own ON public.user_quests;
CREATE POLICY user_quests_select_own ON public.user_quests FOR SELECT USING (auth.uid() = user_id);

DROP TABLE IF EXISTS public.quest_claims CASCADE;

-- 3. Redefine claim_quest to use user_quests
CREATE OR REPLACE FUNCTION public.claim_quest(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_week date := date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_period text;
  v_row record;
  v_xp integer;
  v_total bigint;
  v_inserted text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_period := CASE WHEN left(p_code, 2) = 'w_' THEN v_week::text ELSE v_today::text END;
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text || ':quest'));

  SELECT * INTO v_row
  FROM public.get_daily_quests() q
  WHERE q.code = p_code;

  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive quest'; END IF;
  IF v_row.claimed THEN RAISE EXCEPTION 'Quest already claimed'; END IF;
  IF v_row.progress < v_row.goal THEN RAISE EXCEPTION 'Quest not completed'; END IF;

  v_xp := public.quest_xp(p_code);
  IF v_xp <= 0 THEN RAISE EXCEPTION 'Quest reward is not configured'; END IF;

  INSERT INTO public.user_quests(user_id, period_key, code, claimed, progress)
  VALUES (v_user, v_period, p_code, true, v_row.progress)
  ON CONFLICT (user_id, code, period_key) DO UPDATE SET claimed = true, progress = EXCLUDED.progress
  RETURNING code INTO v_inserted;

  IF v_inserted IS NULL THEN RAISE EXCEPTION 'Quest already claimed'; END IF;

  INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key)
  VALUES (v_user, 'quest', 0, v_xp, 'quest:' || p_code || ':' || v_period)
  ON CONFLICT (user_id, source_key) DO NOTHING;

  UPDATE public.profiles
  SET total_xp = coalesce(total_xp, 0) + v_xp
  WHERE id = v_user
  RETURNING total_xp INTO v_total;

  IF v_total IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  RETURN jsonb_build_object(
    'code', p_code,
    'xpAwarded', v_xp,
    'totalXp', v_total
  );
END;
$$;

-- 4. Redefine get_daily_quests to use user_quests instead of quest_claims
CREATE OR REPLACE FUNCTION public.get_daily_quests()
RETURNS TABLE (
  code text,
  progress integer,
  goal integer,
  xp_reward integer,
  claimed boolean,
  title_vi text,
  title_en text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
      date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_start
  ),
  seed AS (
    SELECT (today - date '2020-01-01')::integer AS n FROM clock
  ),
  p AS (
    SELECT stats_epoch FROM public.profiles WHERE id = auth.uid()
  ),
  daily AS (
    SELECT s.*
    FROM public.training_sessions s, clock c, p
    WHERE s.user_id = auth.uid()
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = c.today
      AND s.created_at >= p.stats_epoch
  ),
  weekly AS (
    SELECT s.*
    FROM public.training_sessions s, clock c, p
    WHERE s.user_id = auth.uid()
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= c.week_start
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < c.week_start + 7
      AND s.created_at >= p.stats_epoch
  ),
  daily_agg AS (
    SELECT
      (SELECT count(*) FROM daily)::integer AS rounds,
      (SELECT count(*) FROM daily WHERE round_score >= 600)::integer AS score_600,
      (SELECT count(*) FROM daily WHERE round_score >= 750)::integer AS score_750,
      (SELECT count(*) FROM daily WHERE round_score >= 850)::integer AS score_850,
      (SELECT count(DISTINCT game) FROM daily)::integer AS games
  ),
  weekly_agg AS (
    SELECT
      (SELECT count(*) FROM weekly)::integer AS rounds,
      (SELECT count(DISTINCT game) FROM weekly)::integer AS games,
      (SELECT count(*) FROM weekly WHERE round_score >= 800)::integer AS score_800,
      (SELECT count(*) FROM weekly WHERE round_score >= 900)::integer AS score_900
  ),
  daily_volume(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n, 3)
        WHEN 0 THEN 'q_rounds_3'
        WHEN 1 THEN 'q_rounds_5'
        ELSE 'q_rounds_7'
      END,
      daily_agg.rounds,
      CASE mod(seed.n, 3) WHEN 0 THEN 3 WHEN 1 THEN 5 ELSE 7 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_quality(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN 'q_score_600'
        WHEN 1 THEN 'q_score_750_2'
        ELSE 'q_score_850'
      END,
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN daily_agg.score_600
        WHEN 1 THEN daily_agg.score_750
        ELSE daily_agg.score_850
      END,
      CASE mod(seed.n + 1, 3) WHEN 1 THEN 2 ELSE 1 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_variety(code, raw_progress, goal) AS (
    SELECT
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3)
            WHEN 0 THEN 'q_games_2'
            WHEN 1 THEN 'q_games_3'
            ELSE 'q_games_4'
          END
        ELSE (ARRAY[
          'q_play_schulte_2','q_play_sudoku_2','q_play_stroop_2',
          'q_play_reaction_2','q_play_memory_2','q_play_nback_2',
          'q_play_math_2','q_play_gonogo_2','q_play_mental_2',
          'q_play_corsi_2','q_play_trail_2'
        ])[mod(seed.n, 11) + 1]
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN daily_agg.games
        ELSE (
          SELECT count(*)::integer
          FROM daily d
          WHERE d.game = (ARRAY[
            'schulte','sudoku','stroop','reaction','memory',
            'nback','math','gonogo','mental','corsi','trail'
          ])[mod(seed.n, 11) + 1]
        )
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3) WHEN 0 THEN 2 WHEN 1 THEN 3 ELSE 4 END
        ELSE 2
      END
    FROM seed CROSS JOIN daily_agg
  ),
  weekly_choice AS (
    SELECT mod(((clock.week_start - date '2020-01-06') / 7), 2) AS variant
    FROM clock
  ),
  weekly_defs(code, raw_progress, goal) AS (
    SELECT 'w_rounds_25', weekly_agg.rounds, 25 FROM weekly_agg
    UNION ALL
    SELECT 'w_games_7', weekly_agg.games, 7 FROM weekly_agg
    UNION ALL
    SELECT
      CASE WHEN weekly_choice.variant = 0 THEN 'w_score_800_5' ELSE 'w_score_900_3' END,
      CASE WHEN weekly_choice.variant = 0 THEN weekly_agg.score_800 ELSE weekly_agg.score_900 END,
      CASE WHEN weekly_choice.variant = 0 THEN 5 ELSE 3 END
    FROM weekly_agg CROSS JOIN weekly_choice
  ),
  defs(code, raw_progress, goal, period_key, sort_order) AS (
    SELECT code, raw_progress, goal, clock.today, 1 FROM daily_volume CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 2 FROM daily_quality CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 3 FROM daily_variety CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.week_start, 10 FROM weekly_defs CROSS JOIN clock
  )
  SELECT
    d.code::text,
    least(greatest(d.raw_progress, 0), d.goal)::integer,
    d.goal::integer,
    public.quest_xp(d.code)::integer,
    EXISTS (
      SELECT 1
      FROM public.user_quests c
      WHERE c.user_id = auth.uid()
        AND c.code = d.code
        AND c.period_key = d.period_key::text
        AND c.claimed = true
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  FROM defs d
  ORDER BY d.sort_order, d.code;
$$;

```

---

### 📄 supabase/migrations/20260807_phase5_gamification.sql (Phase 5 Gamification Schema Baseline)

```sql
-- =============================================================================
-- 20260807_phase5_gamification.sql  — GIAI ĐOẠN 5
--
--  1) Game mới N-Back: nới các ràng buộc game + cột nback_sessions
--  2) VÁ LỖ HỔNG: submit_round_transaction chưa bao giờ ghi training_sessions
--     → Lịch sử luôn rỗng. Nay ghi ngay trong cùng transaction.
--  3) Thành tựu (achievements) — xét ở server, không tin client
--  4) Nhiệm vụ ngày (daily quests) + thưởng XP
--  5) Bạn bè + bảng xếp hạng riêng
-- =============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────
-- 1) N-BACK
-- ────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists nback_sessions integer not null default 0;

revoke update (nback_sessions) on public.profiles from authenticated, anon;

-- round_tickets.game
alter table public.round_tickets drop constraint if exists round_tickets_game_check;
alter table public.round_tickets
  add constraint round_tickets_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback'));

-- training_sessions.game
alter table public.training_sessions drop constraint if exists training_sessions_game_check;
alter table public.training_sessions
  add constraint training_sessions_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback'));

-- xp_events.game: thêm nback + hai nguồn XP phi-ván (quest, achievement)
alter table public.xp_events drop constraint if exists xp_events_game_check;
alter table public.xp_events
  add constraint xp_events_game_check
  check (game in ('schulte','sudoku','stroop','memory','reaction','nback','quest','achievement'));

-- ────────────────────────────────────────────────────────────────────
-- 2) SUBMIT ROUND: thêm nback + GHI training_sessions (vá Lịch sử rỗng)
-- ────────────────────────────────────────────────────────────────────

create or replace function public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
begin
  if p_game not in ('schulte','sudoku','stroop','reaction','memory','nback') then
    raise exception 'Invalid game';
  end if;
  if p_round_score < 0 or p_round_score > 1000 then
    raise exception 'Invalid round score';
  end if;

  select * into v_ticket from public.round_tickets where id = p_ticket_id for update;
  if not found or v_ticket.user_id <> p_user_id or v_ticket.game <> p_game then
    raise exception 'Invalid round ticket';
  end if;
  if v_ticket.submitted_at is not null then raise exception 'Round already submitted'; end if;
  if v_ticket.expires_at < now() then raise exception 'Round ticket expired'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  v_speed   := case when p_axes ? 'speed'   then public.apply_round_rating(coalesce(v_profile.speed_score,0),          (p_axes->>'speed')::integer)   else v_profile.speed_score end;
  v_focus   := case when p_axes ? 'focus'   then public.apply_round_rating(coalesce(v_profile.focus_score,0),          (p_axes->>'focus')::integer)   else v_profile.focus_score end;
  v_spatial := case when p_axes ? 'spatial' then public.apply_round_rating(coalesce(v_profile.cfop_spatial_record,0),  (p_axes->>'spatial')::integer) else v_profile.cfop_spatial_record end;
  v_logic   := case when p_axes ? 'logic'   then public.apply_round_rating(coalesce(v_profile.algebraic_logic_score,0),(p_axes->>'logic')::integer)   else v_profile.algebraic_logic_score end;
  v_memory  := case when p_axes ? 'memory'  then public.apply_round_rating(coalesce(v_profile.memory_score,0),         (p_axes->>'memory')::integer)  else v_profile.memory_score end;

  if v_profile.last_active_date is null then v_streak := 1;
  elsif v_profile.last_active_date = v_today then v_streak := v_profile.synapse_streak;
  elsif v_profile.last_active_date = v_today - 1 then v_streak := v_profile.synapse_streak + 1;
  else v_streak := 1;
  end if;

  select coalesce(sum(e.xp_awarded),0)::integer into v_today_xp
  from public.xp_events e
  where e.user_id = p_user_id
    and (e.created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_today;

  v_xp := greatest(0, least(35, 15 + floor(p_round_score/50.0)::integer, 300 - v_today_xp));
  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (p_user_id, p_game, p_round_score, v_xp);
  end if;

  -- LịCH SỬ: trước đây không hề có dòng này nên bảng luôn rỗng.
  insert into public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score
  ) values (
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer
  );

  update public.profiles set
    speed_score = v_speed,
    focus_score = v_focus,
    cfop_spatial_record = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions  = schulte_sessions  + case when p_game='schulte'  then 1 else 0 end,
    sudoku_sessions   = sudoku_sessions   + case when p_game='sudoku'   then 1 else 0 end,
    stroop_sessions   = stroop_sessions   + case when p_game='stroop'   then 1 else 0 end,
    reaction_sessions = reaction_sessions + case when p_game='reaction' then 1 else 0 end,
    memory_sessions   = memory_sessions   + case when p_game='memory'   then 1 else 0 end,
    nback_sessions    = nback_sessions    + case when p_game='nback'    then 1 else 0 end,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  where id = p_user_id
  returning * into v_profile;

  update public.round_tickets set submitted_at = now() where id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  return jsonb_build_object(
    'profile',   to_jsonb(v_profile),
    'xpAwarded', v_xp,
    'totalXp',   v_profile.total_xp,
    'level',     v_new_level,
    'leveledUp', v_new_level > v_old_level
  );
end;
$$;

revoke all on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer,text,integer)
  from public, anon, authenticated;
grant execute on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer,text,integer)
  to service_role;

-- ────────────────────────────────────────────────────────────────────
-- 3) THÀNH TỰU
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.user_achievements enable row level security;

drop policy if exists user_achievements_select_own on public.user_achievements;
create policy user_achievements_select_own
  on public.user_achievements for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.user_achievements from authenticated, anon;
grant select on public.user_achievements to authenticated;
grant all on public.user_achievements to service_role;

-- XP thưởng theo mã thành tựu (nguồn sự thật ở server).
create or replace function public.achievement_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    when 'first_round'    then 20
    when 'rounds_10'      then 30
    when 'rounds_50'      then 60
    when 'rounds_100'     then 100
    when 'streak_3'       then 30
    when 'streak_7'       then 60
    when 'streak_30'      then 100
    when 'level_5'        then 40
    when 'level_10'       then 70
    when 'level_20'       then 100
    when 'axis_500'       then 50
    when 'axis_800'       then 100
    when 'all_games'      then 80
    when 'score_900'      then 90
    when 'sudoku_extreme' then 80
    when 'nback_ace'      then 90
    else 0
  end;
$$;

-- Xét lại toàn bộ điều kiện từ dữ liệu thật, mở khoá cái nào chưa có và cộng XP.
create or replace function public.sync_achievements()
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_rounds bigint;
  v_distinct_games bigint;
  v_best integer;
  v_max_axis integer;
  v_level integer;
  v_has_extreme boolean;
  v_nback_best integer;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_p from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;

  select count(*), count(distinct s.game), coalesce(max(s.round_score),0)
    into v_rounds, v_distinct_games, v_best
  from public.training_sessions s where s.user_id = v_user;

  select coalesce(max(s.round_score),0) into v_nback_best
  from public.training_sessions s where s.user_id = v_user and s.game = 'nback';

  select exists(
    select 1 from public.training_sessions s
    where s.user_id = v_user and s.game = 'sudoku' and s.label = 'Extreme'
  ) into v_has_extreme;

  v_max_axis := greatest(
    coalesce(v_p.speed_score,0), coalesce(v_p.focus_score,0),
    coalesce(v_p.memory_score,0), coalesce(v_p.algebraic_logic_score,0),
    coalesce(v_p.cfop_spatial_record,0)
  );
  v_level := floor((-1 + sqrt(1 + coalesce(v_p.total_xp,0)/12.5))/2)::integer + 1;

  -- Danh sách mã đạt điều kiện
  if v_rounds >= 1   then v_new := v_new || 'first_round'; end if;
  if v_rounds >= 10  then v_new := v_new || 'rounds_10';   end if;
  if v_rounds >= 50  then v_new := v_new || 'rounds_50';   end if;
  if v_rounds >= 100 then v_new := v_new || 'rounds_100';  end if;
  if coalesce(v_p.synapse_streak,0) >= 3  then v_new := v_new || 'streak_3';  end if;
  if coalesce(v_p.synapse_streak,0) >= 7  then v_new := v_new || 'streak_7';  end if;
  if coalesce(v_p.synapse_streak,0) >= 30 then v_new := v_new || 'streak_30'; end if;
  if v_level >= 5  then v_new := v_new || 'level_5';  end if;
  if v_level >= 10 then v_new := v_new || 'level_10'; end if;
  if v_level >= 20 then v_new := v_new || 'level_20'; end if;
  if v_max_axis >= 500 then v_new := v_new || 'axis_500'; end if;
  if v_max_axis >= 800 then v_new := v_new || 'axis_800'; end if;
  if v_distinct_games >= 6 then v_new := v_new || 'all_games'; end if;
  if v_best >= 900 then v_new := v_new || 'score_900'; end if;
  if v_has_extreme then v_new := v_new || 'sudoku_extreme'; end if;
  if v_nback_best >= 700 then v_new := v_new || 'nback_ace'; end if;

  -- Mở khoá những cái chưa có + cộng XP thưởng một lần duy nhất
  foreach v_code in array v_new loop
    if not exists (
      select 1 from public.user_achievements a
      where a.user_id = v_user and a.code = v_code
    ) then
      insert into public.user_achievements(user_id, code) values (v_user, v_code);
      v_xp := public.achievement_xp(v_code);
      if v_xp > 0 then
        insert into public.xp_events(user_id, game, round_score, xp_awarded)
        values (v_user, 'achievement', 0, v_xp);
        update public.profiles set total_xp = coalesce(total_xp,0) + v_xp where id = v_user;
      end if;
    end if;
  end loop;

  return query
    select a.code, a.unlocked_at, (a.unlocked_at > now() - interval '10 seconds')
    from public.user_achievements a
    where a.user_id = v_user
    order by a.unlocked_at desc;
end;
$$;

revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 4) NHIỆM VỤ NGÀY
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.quest_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  quest_day  date not null,
  code       text not null,
  xp_awarded integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_day, code)
);

alter table public.quest_claims enable row level security;

drop policy if exists quest_claims_select_own on public.quest_claims;
create policy quest_claims_select_own
  on public.quest_claims for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.quest_claims from authenticated, anon;
grant select on public.quest_claims to authenticated;
grant all on public.quest_claims to service_role;

create or replace function public.quest_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    when 'q_rounds_3'  then 30
    when 'q_score_600' then 40
    when 'q_two_games' then 30
    when 'q_xp_60'     then 20
    else 0
  end;
$$;

-- Tiến độ nhiệm vụ hôm nay (theo ngày Việt Nam), tính từ dữ liệu thật.
create or replace function public.get_daily_quests()
returns table (
  code      text,
  progress  integer,
  goal      integer,
  xp_reward integer,
  claimed   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d
  ),
  s as (
    select *
    from public.training_sessions ts, today
    where ts.user_id = auth.uid()
      and (ts.created_at at time zone 'Asia/Ho_Chi_Minh')::date = today.d
  ),
  x as (
    select coalesce(sum(e.xp_awarded),0)::integer as xp
    from public.xp_events e, today
    where e.user_id = auth.uid()
      and (e.created_at at time zone 'Asia/Ho_Chi_Minh')::date = today.d
  ),
  agg as (
    select
      (select count(*) from s)::integer                                as rounds,
      (select count(*) from s where s.round_score >= 600)::integer     as high,
      (select count(distinct s.game) from s)::integer                  as games,
      (select xp from x)                                               as xp
  ),
  defs as (
    select 'q_rounds_3'::text  as code, least((select rounds from agg), 3) as progress, 3  as goal
    union all select 'q_score_600', least((select high  from agg), 1), 1
    union all select 'q_two_games', least((select games from agg), 2), 2
    union all select 'q_xp_60',     least((select xp    from agg), 60), 60
  )
  select
    d.code,
    d.progress::integer,
    d.goal::integer,
    public.quest_xp(d.code) as xp_reward,
    exists (
      select 1 from public.quest_claims c, today
      where c.user_id = auth.uid() and c.code = d.code and c.quest_day = today.d
    ) as claimed
  from defs d
  order by d.code;
$$;

revoke all on function public.get_daily_quests() from public, anon;
grant execute on function public.get_daily_quests() to authenticated;

-- Nhận thưởng: server tự kiểm tra đủ điều kiện, không tin client.
create or replace function public.claim_quest(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_row record;
  v_xp integer;
  v_total bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_row from public.get_daily_quests() q where q.code = p_code;
  if not found then raise exception 'Unknown quest'; end if;
  if v_row.claimed then raise exception 'Quest already claimed'; end if;
  if v_row.progress < v_row.goal then raise exception 'Quest not completed'; end if;

  v_xp := public.quest_xp(p_code);

  insert into public.quest_claims(user_id, quest_day, code, xp_awarded)
  values (v_user, v_today, p_code, v_xp)
  on conflict do nothing;

  if not found then
    null;
  end if;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (v_user, 'quest', 0, v_xp);
    update public.profiles set total_xp = coalesce(total_xp,0) + v_xp
    where id = v_user
    returning total_xp into v_total;
  else
    select total_xp into v_total from public.profiles where id = v_user;
  end if;

  return jsonb_build_object('code', p_code, 'xpAwarded', v_xp, 'totalXp', v_total);
end;
$$;

revoke all on function public.claim_quest(text) from public, anon;
grant execute on function public.claim_quest(text) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 5) BẠN BÈ
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- Một cặp chỉ có một quan hệ, bất kể ai gửi trước.
create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_involved on public.friendships;
create policy friendships_select_involved
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

revoke insert, update, delete on public.friendships from authenticated, anon;
grant select on public.friendships to authenticated;
grant all on public.friendships to service_role;

-- Tìm người chơi theo username (chỉ trả trường công khai).
create or replace function public.search_players(p_query text, p_limit integer default 10)
returns table (id uuid, username text, avatar_url text, cognitive_index double precision)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url, p.cognitive_index
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(coalesce(trim(p_query), '')) >= 2
    and p.username ilike '%' || trim(p_query) || '%'
  order by p.cognitive_index desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

revoke all on function public.search_players(text, integer) from public, anon;
grant execute on function public.search_players(text, integer) to authenticated;

create or replace function public.send_friend_request(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.friendships%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_target is null or p_target = v_user then raise exception 'Invalid target'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'Player not found';
  end if;

  select * into v_existing from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_user, p_target)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_target);

  if found then
    -- Nếu họ đã mời mình trước đó thì coi như chấp nhận luôn.
    if v_existing.status = 'pending' and v_existing.addressee_id = v_user then
      update public.friendships set status = 'accepted', responded_at = now()
      where id = v_existing.id;
      return jsonb_build_object('status', 'accepted');
    end if;
    return jsonb_build_object('status', v_existing.status);
  end if;

  insert into public.friendships(requester_id, addressee_id) values (v_user, p_target);
  return jsonb_build_object('status', 'pending');
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_row from public.friendships where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  -- Chỉ người được mời mới được trả lời.
  if v_row.addressee_id <> v_user then raise exception 'Not your request'; end if;
  if v_row.status <> 'pending' then raise exception 'Request already handled'; end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_request;
    return jsonb_build_object('status', 'accepted');
  end if;

  delete from public.friendships where id = p_request;
  return jsonb_build_object('status', 'declined');
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friend(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_user, p_other)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_other);

  return jsonb_build_object('status', 'removed');
end;
$$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Danh sách bạn bè + lời mời (một lần gọi cho cả hai).
create or replace function public.get_friends()
returns table (
  friendship_id uuid,
  player_id     uuid,
  username      text,
  avatar_url    text,
  status        text,
  direction     text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.username,
    p.avatar_url,
    f.status,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by f.status desc, f.created_at desc;
$$;

revoke all on function public.get_friends() from public, anon;
grant execute on function public.get_friends() to authenticated;

-- Bảng xếp hạng riêng: chỉ gồm bạn đã chấp nhận + chính mình.
create or replace function public.get_friend_leaderboard()
returns table (
  id              uuid,
  username        text,
  avatar_url      text,
  cognitive_index double precision,
  total_xp        bigint,
  synapse_streak  integer,
  is_me           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with circle as (
    select auth.uid() as uid
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and auth.uid() in (f.requester_id, f.addressee_id)
  )
  select
    p.id, p.username, p.avatar_url, p.cognitive_index,
    p.total_xp, p.synapse_streak,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  join circle c on c.uid = p.id
  where auth.uid() is not null
  order by p.cognitive_index desc nulls last
  limit 100;
$$;

revoke all on function public.get_friend_leaderboard() from public, anon;
grant execute on function public.get_friend_leaderboard() to authenticated;

```

---

### 📄 docs/feature_gamification_social.txt (Feature Documentation: Gamification & Social)

```text
TỔNG HỢP TÍNH NĂNG GAMIFICATION (THÀNH TỰU, NHIỆM VỤ, XÃ HỘI & LỊCH SỬ TIẾN TRÌNH) - MINDGEM
====================================================================================================

1. TỔNG QUAN (OVERVIEW)
----------------------------------------------------------------------------------------------------
Phân hệ Gamification & Social trong dự án MindGem là hệ thống cốt lõi nhằm thúc đẩy động lực luyện tập hàng ngày (user engagement & retention), theo dõi Chỉ số Nhận thức (Cognitive Index - CI), vinh danh thành tựu cá nhân và kết nối cộng đồng người chơi.

Phân hệ bao gồm 4 trụ cột chức năng chính:
- Thành tựu (Achievements / Badges): Hệ thống 52+ huy hiệu danh hiệu được chia thành 5 hạng (Đồng, Bạc, Vàng, Bạch kim, Kim cương) và 6 nhóm mục tiêu. Người chơi mở khoá danh hiệu thông qua việc tích luỹ số ván, nâng cao cấp độ, chinh phục các chỉ số nhận thức và vượt qua thử thách riêng của từng trò chơi. Phần thưởng XP tương ứng được hệ thống tự động cộng vào tài khoản.
- Nhiệm vụ (Daily & Weekly Quests): Hệ thống gồm 3 nhiệm vụ ngày (làm mới lúc 00:00 GMT+7) và 3 nhiệm vụ tuần (làm mới vào thứ Hai GMT+7). Tiến độ nhiệm vụ được tính toán tự động dựa trên kết quả luyện tập thực tế. Người chơi chủ động bấm nút "NHẬN" (Claim) trên giao diện để thu thập điểm kinh nghiệm (XP).
- Xã hội & Bảng xếp hạng Bạn bè (Social & Friends Leaderboard): Cho phép tìm kiếm người chơi khác theo tên tài khoản (tối thiểu 2 ký tự), gửi/chấp nhận/từ chối lời mời kết bạn, huỷ kết bạn và theo dõi Bảng xếp hạng riêng (Private Leaderboard) để so kè Chỉ số Nhận thức (CI) và Tổng XP tích luỹ với danh sách bạn bè đã kết nối.
- Lịch sử Luyện tập & Tiến trình (Training History & Progress Chart): Ghi nhận chi tiết từng ván đấu (thời gian, điểm số, 5 trục nhận thức Speed, Focus, Spatial, Logic, Memory, XP thưởng), quản lý Kỷ lục cá nhân (Personal Bests) theo từng trò chơi (đặc biệt hỗ trợ kỷ lục phân mảnh theo cấu hình ma trận và chế độ chơi cho Schulte Grid), cùng biểu đồ tiến trình 7/30/90 ngày trực quan với tính năng hỗ trợ người mù màu.


2. KIẾN TRÚC HỆ THỐNG (ARCHITECTURE)
----------------------------------------------------------------------------------------------------
Hệ thống được thiết kế theo mô hình Client-Server chặt chẽ kết hợp với triết lý Security Definer RPC trên nền tảng Supabase (PostgreSQL) và Next.js / React Frontend:

A. Tầng Client (Frontend):
- Vị trí: `src/app/components/` và `src/app/lib/`
- Vai trò: Đảm nhận toàn bộ việc hiển thị giao diện UI panels (`AchievementsPanel`, `QuestsPanel`, `FriendsPanel`, `HistoryPanel`, `ProgressChart`), quản lý trạng thái local, điều hướng bộ lọc (Filter), tối ưu hóa hiệu năng nạp trang (Lazy loading thư viện đồ họa Recharts), và định nghĩa catalog nhãn hiển thị đa ngôn ngữ (Việt - Anh) kèm cơ chế fallback nhãn nhiệm vụ an toàn.

B. Tầng Server & Database (Backend):
- Vị trí: Supabase PostgreSQL Stored Procedures / RPC Functions & Edge Functions
- Vai trò: Đảm nhận 100% logic nghiệp vụ, tính toán điều kiện mở khoá thành tựu (`sync_achievements`), theo dõi tiến độ nhiệm vụ ngày/tuần (`get_daily_quests`), kiểm tra điều kiện và trao thưởng XP nguyên tử (`claim_quest`), quản lý quan hệ kết bạn hai chiều (`send_friend_request`, `respond_friend_request`, `remove_friend`, `get_friends`, `get_friend_leaderboard`) và tổng hợp dữ liệu tiến trình (`get_progress_series`, `get_personal_bests`, `get_schulte_config_bests`).

C. Triết lý Bảo mật Nguyên tắc Trung tâm:
- Trình duyệt tuyệt đối KHÔNG bao giờ tự tuyên bố hoàn thành nhiệm vụ, mở thành tựu hay tự cộng điểm XP. Tất cả mọi cờ mở khoá và điểm thưởng đều do các Stored Procedures (chạy với quyền `SECURITY DEFINER`) kiểm tra từ bảng dữ liệu gốc (`training_sessions`, `profiles`) và cấp phát trực tiếp tại cơ sở dữ liệu.


3. CÁC FILE LIÊN QUAN (RELATED FILES)
----------------------------------------------------------------------------------------------------
1. `src/app/lib/achievements.ts`:
   Định nghĩa danh mục hiển thị toàn bộ huy hiệu (mã badge, icon emoji, XP thưởng, hạng tier, nhóm category, tên & mô tả đa ngôn ngữ vi/en), bảng màu đại diện cho các hạng và tính tổng XP huy hiệu.

2. `src/app/lib/quest-labels.ts`:
   Quản lý nhãn hiển thị nhiệm vụ phía client; chứa từ điển nhãn tĩnh `QUEST_LABELS`, hàm `humanizeQuestCode` dịch mã kỹ thuật thành câu tiếng Việt/Anh đọc được, và hàm `resolveQuestLabel` xử lý chuỗi ưu tiên hiển thị.

3. `src/app/lib/api/gamification.ts`:
   Cung cấp các hàm API Client gọi RPC Supabase cho thành tựu và nhiệm vụ (`syncAchievements`, `fetchAchievementProgress`, `fetchDailyQuests`, `claimQuest`).

4. `src/app/lib/api/social.ts`:
   Cung cấp các hàm API Client gọi RPC Supabase cho tính năng xã hội và bạn bè (`searchPlayers`, `fetchFriends`, `sendFriendRequest`, `respondFriendRequest`, `removeFriend`, `fetchFriendLeaderboard`).

5. `src/app/lib/api/history.ts`:
   Cung cấp các hàm API Client truy vấn Supabase RLS và RPC cho lịch sử ván đấu (`fetchTrainingHistory`), kỷ lục cá nhân (`fetchPersonalBests`, `fetchSchulteConfigBests`) và chuỗi tiến trình (`fetchProgressSeries`).

6. `src/app/components/achievements-panel.tsx`:
   Component React hiển thị Bảng Thành tựu: hỗ trợ lọc theo nhóm, thanh tiến độ công việc, trạng thái khoá/mở huy hiệu, sắp xếp huy hiệu gần hoàn thành lên trước và thông báo Toast khi có thành tựu mới.

7. `src/app/components/quests-panel.tsx`:
   Component React hiển thị Bảng Nhiệm vụ: chia làm 2 phần Nhiệm vụ Hôm nay và Nhiệm vụ Tuần này, hiển thị tiến độ dạng thanh phần trăm, nút bấm "NHẬN" nhận thưởng XP và xử lý trạng thái chờ.

8. `src/app/components/friends-panel.tsx`:
   Component React quản lý Mạng lưới Bạn bè: tích hợp ô tìm kiếm người chơi có hoãn gõ (debounce), hiển thị danh sách lời mời đến/đi, danh sách bạn bè và Bảng xếp hạng riêng so kè Chỉ số Nhận thức (CI).

9. `src/app/components/history-panel.tsx`:
   Component React hiển thị Lịch sử Luyện tập: bao gồm các thẻ Kỷ lục cá nhân (Personal Best) cho từng game, bộ lọc danh sách 100 ván đấu gần đây và nạp bất đồng bộ (Lazy Load) biểu đồ tiến trình.

10. `src/app/components/progress-chart.tsx`:
    Component React vẽ biểu đồ tiến trình 7/30/90 ngày bằng thư viện Recharts: biểu diễn XP & số ván đấu (ComposedChart), diễn biến 5 trục nhận thức (LineChart) kèm kiểu nét đứt accessible hỗ trợ người mù màu.


4. CHI TIẾT TRIỂN KHAI (IMPLEMENTATION DETAILS)
----------------------------------------------------------------------------------------------------
A. Danh mục Thành tựu & Phân hạng (Achievements Catalog):
- 5 Hạng Huy hiệu (Tiers) kèm mã màu chuẩn:
  + Bronze (Đồng): `#B45309`
  + Silver (Bạc): `#94A3B8`
  + Gold (Vàng): `#F59E0B`
  + Platinum (Bạch kim): `#22D3EE`
  + Diamond (Kim cương): `#A855F7`
- 6 Nhóm Huy hiệu (Categories):
  + `volume`: Số ván chơi tích luỹ (1, 10, 50, 100, 250, 500, 1000 ván).
  + `level`: Cấp độ và mốc XP (Cấp 5, 10, 20, 30, 50 và mốc 10.000 XP).
  + `mastery`: Điểm mốc trục nhận thức (Một trục đạt 500/800/900/950, Cả 5 trục đạt 500/700/850).
  + `breadth`: Tính toàn diện theo trò (Chơi đủ tất cả các trò, Mỗi trò chơi ≥ 10 ván, Mỗi trò đạt 600+ điểm).
  + `score`: Thành tích điểm cao trong một ván (Đạt 900+, 950+, 990+, và 10 ván đạt 950+).
  + `game`: Thành tích riêng của từng trò (Schulte 700/900/6x6, Sudoku 700/900/Extreme, Stroop 700/900, Reaction 700/900, Memory Matrix 700/900, N-Back 700/900/5-Back, Math Sprint 700/900, Go/No-Go 700/900, Mental Rotation 700/900).
- Sắp xếp thông minh: Component `AchievementsPanel` tự động sắp xếp danh sách hiển thị bằng thuật toán: Huy hiệu đã mở khoá xếp theo thứ tự tier; Huy hiệu CHƯA mở khoá được ưu tiên xếp theo tỷ lệ hoàn thành (`progress / goal`) giảm dần để người chơi thấy ngay các mục tiêu sắp đạt được.

B. Chuỗi Phân giải Nhãn Nhiệm vụ (Quest Labeling Resolution Chain):
Để đảm bảo giao diện KHÔNG BAO GIỜ hiển thị mã kỹ thuật thô (như `w_games_7` hay `q_rounds_3`), hàm `resolveQuestLabel(code, lang, serverTitle)` thực hiện phân giải theo 4 cấp ưu tiên nghiêm ngặt:
  1. Ưu tiên 1: `serverTitle` trả về từ database RPC (nếu có và khác chuỗi mã `code`).
  2. Ưu tiên 2: Ánh xạ cứng từ từ điển `QUEST_LABELS[code][lang]`.
  3. Ưu tiên 3: Hàm `humanizeQuestCode(code, lang)` tự động phân tích cấu trúc mã dạng snake_case:
     - `rounds_N` -> "Chơi N ván" / "Play N rounds"
     - `score_N` -> "Đạt N+ trong một ván" / "Score N+ in one round"
     - `score_N_M` -> "Đạt N+ trong M ván" / "Score N+ in M rounds"
     - `games_N` -> "Chơi N trò khác nhau" / "Play N different games"
     - `play_<game>_N` -> "Chơi <Tên trò> N ván" / "Play N <Tên trò> rounds" (tra cứu qua `QUEST_GAME_NAMES`)
     - Tiền tố `w_` -> Thêm nhãn "Tuần: " / "Weekly: "
    4. Ưu tiên 4: Fallback chuỗi an toàn "Nhiệm vụ" (tiếng Việt) hoặc "Quest" (tiếng Anh).

  5. Hợp đồng Eligibility (Practice Contract):
     + Online ranked: Rating=Có, XP=Có, Quest=Có, Streak=Có, Achievement điểm cao=Có
     + Accessible practice: Rating=Không, XP=Giới hạn, Quest=Có tùy quest, Streak=Có, Achievement điểm cao=Không
     + Offline recent: Rating=Không, XP=Giới hạn, Quest=Không hoặc giới hạn, Streak=Theo received date, Achievement=Không
     + Offline stale: Rating=Không, XP=Không, Quest=Không, Streak=Không, Achievement=Không

C. Quản lý Mạng lưới Bạn bè & Bảng xếp hạng (Social & Private Leaderboard):
- Trạng thái kết bạn (Friendship Status & Direction):
  Bảng `friendships` trong cơ sở dữ liệu lưu các cặp (`user_id`, `friend_id`, `status`: `'pending' | 'accepted'`). RPC `get_friends` tự động ánh xạ góc nhìn người dùng hiện tại thành 3 hướng (`direction`):
  + `'incoming'`: Lời mời kết bạn từ người khác gửi tới mình (cho phép Nút Chấp nhận / Từ chối).
  + `'outgoing'`: Lời mời kết bạn do mình gửi đi đang chờ đối phương phản hồi.
  + `'friend'`: Hai bên đã chấp nhận kết bạn (`status = 'accepted'`).
- Bảng xếp hạng riêng (`fetchFriendLeaderboard` / RPC `get_friend_leaderboard`):
  Chỉ trả về danh sách bao gồm bạn bè chính thức (`status = 'accepted'`) và bản thân người dùng (`is_me: true`). Bảng xếp hạng được sắp xếp giảm dần theo Chỉ số Nhận thức (`cognitive_index`), giúp người chơi so kè trình độ trực tiếp với bạn bè.

D. Kỷ lục Cá nhân Chuyên sâu & Schulte Config Bests:
- `fetchPersonalBests`: Trả về kỷ lục tổng quan từng game (`best_score`, `best_time_ms`, `avg_score`, `rounds`, `total_xp`).
- `fetchSchulteConfigBests`: Do game Schulte Grid có nhiều kích thước ma trận (3x3, 4x4, 5x5, 6x6) và 3 chế độ chơi (`classic`, `reverse`, `dual`), RPC `get_schulte_config_bests` trả về kỷ lục riêng biệt cho từng cấu hình. Phía client sử dụng helper `schulteBestMapKey(size, mode)` tạo key dạng `${grid_size}_${mode}` để tra cứu cực nhanh.

E. Biểu đồ Tiến trình Hỗ trợ Accessibility (Progress Chart):
- Nạp bất đồng bộ (Code Splitting): Thư viện Recharts có dung lượng ~100KB được tách thành chunk riêng thông qua `React.lazy` và `Suspense` (`ChartFallback`). Người dùng ở màn hình chính không phải nạp trước chunk này.
- Accessible Design cho 5 Trục Nhận thức: Do khoảng 8% nam giới dính chứng mù màu đỏ - lục, ngoài 5 màu sắc phân biệt (`speed`: xanh lá `#10B981`, `focus`: tím `#A855F7`, `spatial`: hổ phách `#F59E0B`, `logic`: xanh lam `#00D4FF`, `memory`: hồng `#F43F5E`), mỗi trục được gán một kiểu nét đứt (`strokeDasharray`) riêng biệt (`focus`: `6 3`, `spatial`: `2 3`, `logic`: `10 3 2 3`, `memory`: `1 4`). Nhờ đó, người dùng vẫn phân biệt được các đường biểu diễn khi in đen trắng hoặc khi không nhìn rõ màu sắc.


5. LUỒNG DỮ LIỆU (DATA FLOW)
----------------------------------------------------------------------------------------------------
A. Luồng Mở khoá Thành tựu & Đọc Tiến độ:
  1. Người dùng chuyển sang tab Thành tựu -> `AchievementsPanel` được mount.
  2. `useEffect` kích hoạt `syncAchievements()` gửi yêu cầu RPC `sync_achievements` tới Supabase.
  3. Database chạy Stored Procedure quét bảng `training_sessions` và `profiles` của người dùng:
     - Kiểm tra điều kiện từng thành tựu chưa mở.
     - Nếu đủ điều kiện, ghi nhận bản ghi mở khoá vào bảng `user_achievements`, và ghi 1 giao dịch thưởng XP vào bảng `xp_events` (DB Trigger sẽ tự cộng vào `profiles.total_xp`).
     - Trả về danh sách các huy hiệu kèm thuộc tính `newly_unlocked`.
  4. Nếu có huy hiệu `newly_unlocked === true`, client phát hiệu ứng Toast "Mở khoá thành tựu mới!".
  5. Tiếp theo, client gọi `fetchAchievementProgress()` -> RPC `get_achievement_progress` trả về mảng `AchievementProgress[]` chứa tỷ lệ `progress / goal`.
  6. Component tính toán tổng XP đã đạt, số lượng huy hiệu đã mở, sắp xếp danh sách huy hiệu và render ra màn hình.

B. Luồng Làm Nhiệm vụ & Nhận thưởng XP:
  1. Người dùng hoàn thành một ván luyện tập -> Hệ thống lưu ván vào `training_sessions`.
  2. Người dùng mở tab Nhiệm vụ -> `QuestsPanel` gọi `fetchDailyQuests()` -> RPC `get_daily_quests`.
  3. Database tổng hợp số ván đấu, điểm số đạt được trong ngày (tính từ 00:00 giờ Việt Nam) và trong tuần (tính từ 00:00 thứ Hai giờ Việt Nam), so sánh với các mốc nhiệm vụ và trả về danh sách `DailyQuest[]`.
  4. Nếu một nhiệm vụ có `progress >= goal` và `claimed === false`, nút "NHẬN" (Claim) sáng lên.
  5. Người dùng nhấn "NHẬN" -> Client gọi `claimQuest(code)` -> RPC `claim_quest(p_code)`.
  6. Database kiểm tra nguyên tử: khẳng định nhiệm vụ đã đạt và chưa từng nhận thưởng -> đặt `claimed = true` trong bảng `user_quests` -> ghi nhận một giao dịch vào bảng `xp_events` (Mô hình Ledger) -> DB Trigger `trg_xp_events_apply` sẽ tự động cộng thêm `xp_awarded` vào `profiles.total_xp` mà không cần query cập nhật trực tiếp -> trả về số XP thưởng.
  7. Client nhận kết quả, hiển thị Toast "Đã nhận +X XP", làm mới lại danh sách nhiệm vụ và phát sự kiện `onClaimed` để cập nhật tổng XP trên thanh Header.

C. Luồng Tìm kiếm người chơi & Kết bạn:
  1. Người dùng nhập tên tài khoản cần tìm vào ô Search trong `FriendsPanel`.
  2. `useEffect` sử dụng timer hoãn (debounce 350ms, rate limit DB-level 15 req/5 phút). Khi từ khóa `query.trim().length >= 2`, hàm `searchPlayers(query)` được gọi -> RPC `search_players`.
  3. Database trả về tối đa 10 kết quả phù hợp (`PlayerSearchResult[]`).
  4. Người dùng nhấn nút "Kết bạn" bên cạnh tên người chơi -> Gọi `sendFriendRequest(targetId)` -> RPC `send_friend_request`.
  5. Database chèn bản ghi mới vào bảng `friendships` với `status = 'pending'`.
  6. Client hiển thị Toast "Đã gửi lời mời", xóa từ khóa tìm kiếm và gọi lại `load()` (`fetchFriends()` & `fetchFriendLeaderboard()`) để cập nhật giao diện.


6. BẢO MẬT & VALIDATION (SECURITY & VALIDATION)
----------------------------------------------------------------------------------------------------
A. Nguyên tắc Chống Gian lận XP & Thành tựu (Server-Enforced Integrity):
- Toàn bộ điều kiện hoàn thành nhiệm vụ và mở khoá thành tựu được kiểm tra trực tiếp từ các ván đấu hợp lệ lưu trên server (`training_sessions`). Các ván đấu này bắt buộc phải trải qua quy trình anti-cheat (`scoreAndValidate`, `inspectRound`) ở Edge Function trước khi được ghi vào cơ sở dữ liệu.
- Phía Client không gửi bất kỳ tham số cờ hoàn thành nào lên server. RPC `claim_quest` và `sync_achievements` tự động xác minh tính hợp lệ và chỉ cộng XP một lần duy nhất (Idempotent).

B. Bảo mật Context & Quyền truy cập (Supabase RLS & Security Definer):
- Tất cả các hàm RPC liên quan đến Gamification và Social đều sử dụng `SECURITY DEFINER` và tự động trích xuất `auth.uid()` từ JWT Token do Supabase Auth quản lý. Người dùng không thể truyền `user_id` giả mạo để nhận thưởng hộ tài khoản khác.
- Các thao tác xã hội (`respondFriendRequest`, `removeFriend`) kiểm tra nghiêm ngặt quyền sở hữu: chỉ có người nhận mới có quyền chấp nhận/từ chối lời mời (`friendship_id`), và chỉ có hai người trong cuộc mới có quyền hủy kết bạn.
- Bảng xếp hạng bạn bè (`get_friend_leaderboard`) áp dụng INNER JOIN bắt buộc kiểm tra `status = 'accepted'`, đảm bảo không rò rỉ Chỉ số Nhận thức (CI) cho người lạ.

C. Validation & Giới hạn Tải (Rate Limiting & Input Sanitization):
- Tìm kiếm người chơi (`searchPlayers`): Bắt buộc từ khóa tìm kiếm tối thiểu 2 ký tự (`query.trim().length >= 2`), ép kiểu và cắt khoảng trắng, giới hạn tối đa 10 kết quả (`p_limit: 10`), kết hợp hoãn gõ (debounce 350ms, rate limit DB-level 15 req/5 phút) phía UI để ngăn chặn tấn công Spam RPC Request.
- Phân trang Lịch sử (`fetchTrainingHistory`): Giới hạn tham số `limit` trong khoảng an toàn `[1, 200]` (`Math.min(Math.max(opts.limit ?? 50, 1), 200)`), phòng tránh việc truy vấn hàng ngàn dòng dữ liệu gây cạn kiệt bộ nhớ trình duyệt.



```

---
