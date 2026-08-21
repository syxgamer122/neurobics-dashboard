-- ==============================================================================
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
