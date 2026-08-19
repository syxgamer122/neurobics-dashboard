-- 20260911000000_phase11_offline_sync_columns.sql

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

-- 1. Add columns to training_sessions
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'online';

-- 2. Update submit_round_transaction to accept occurred_at and provenance
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer);
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer);
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version text default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
BEGIN
  IF p_game NOT IN ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo','mental','corsi','trail','search') THEN
    RAISE EXCEPTION 'Invalid game';
  END IF;
  IF p_round_score < 0 OR p_round_score > 1000 THEN
    RAISE EXCEPTION 'Invalid round score';
  END IF;

  SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.user_id <> p_user_id OR v_ticket.game <> p_game THEN
    RAISE EXCEPTION 'Invalid round ticket';
  END IF;
  IF v_ticket.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Round already submitted'; END IF;
  IF v_ticket.expires_at < now() THEN RAISE EXCEPTION 'Round ticket expired'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT count(*)::integer INTO v_recent
  FROM public.training_sessions s
  WHERE s.user_id = p_user_id AND s.created_at > now() - interval '1 hour';

  IF v_recent >= 40 THEN
    PERFORM public.record_cheat_flag(
      p_user_id, p_game, 'Nộp quá nhiều ván trong một giờ', 'hard',
      jsonb_build_object('roundsLastHour', v_recent)
    );
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  v_idle := public.idle_days_vn(v_profile.last_active_date);

  v_base_speed   := public.decay_rating(coalesce(v_profile.speed_score, 0),           v_idle);
  v_base_focus   := public.decay_rating(coalesce(v_profile.focus_score, 0),           v_idle);
  v_base_spatial := public.decay_rating(coalesce(v_profile.cfop_spatial_record, 0),   v_idle);
  v_base_logic   := public.decay_rating(coalesce(v_profile.algebraic_logic_score, 0), v_idle);
  v_base_memory  := public.decay_rating(coalesce(v_profile.memory_score, 0),          v_idle);

  v_speed   := CASE WHEN p_axes ? 'speed'   THEN public.apply_round_rating(v_base_speed,   (p_axes->>'speed')::integer)   ELSE v_base_speed END;
  v_focus   := CASE WHEN p_axes ? 'focus'   THEN public.apply_round_rating(v_base_focus,   (p_axes->>'focus')::integer)   ELSE v_base_focus END;
  v_spatial := CASE WHEN p_axes ? 'spatial' THEN public.apply_round_rating(v_base_spatial, (p_axes->>'spatial')::integer) ELSE v_base_spatial END;
  v_logic   := CASE WHEN p_axes ? 'logic'   THEN public.apply_round_rating(v_base_logic,   (p_axes->>'logic')::integer)   ELSE v_base_logic END;
  v_memory  := CASE WHEN p_axes ? 'memory'  THEN public.apply_round_rating(v_base_memory,  (p_axes->>'memory')::integer)  ELSE v_base_memory END;

  v_streak := CASE
    WHEN v_profile.last_active_date = v_today THEN coalesce(v_profile.synapse_streak, 0)
    WHEN v_profile.last_active_date = v_today - 1 THEN coalesce(v_profile.synapse_streak, 0) + 1
    ELSE 1
  END;

  SELECT coalesce(sum(xp_awarded), 0)::integer INTO v_today_xp
  FROM public.xp_events
  WHERE user_id = p_user_id
    AND created_at >= (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh')
    AND created_at <  ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');

  v_xp := greatest(0, least(100, round(p_round_score / 10.0)::integer));
  IF coalesce(v_profile.flagged, false) THEN
    v_xp := 0;
  ELSIF v_today_xp + v_xp > 500 THEN
    v_xp := greatest(0, 500 - v_today_xp);
  END IF;

  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded)
    VALUES (p_user_id, p_game, p_round_score, v_xp);
  END IF;

  INSERT INTO public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance
  ) VALUES (
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
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance
  );

  UPDATE public.profiles SET
    speed_score = v_speed,
    focus_score = v_focus,
    cfop_spatial_record = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions  = schulte_sessions  + CASE WHEN p_game='schulte'  THEN 1 ELSE 0 END,
    sudoku_sessions   = sudoku_sessions   + CASE WHEN p_game='sudoku'   THEN 1 ELSE 0 END,
    stroop_sessions   = stroop_sessions   + CASE WHEN p_game='stroop'   THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game='reaction' THEN 1 ELSE 0 END,
    memory_sessions   = memory_sessions   + CASE WHEN p_game='memory'   THEN 1 ELSE 0 END,
    nback_sessions    = nback_sessions    + CASE WHEN p_game='nback'    THEN 1 ELSE 0 END,
    math_sessions     = math_sessions     + CASE WHEN p_game='math'     THEN 1 ELSE 0 END,
    gonogo_sessions   = gonogo_sessions   + CASE WHEN p_game='gonogo'   THEN 1 ELSE 0 END,
    mental_sessions   = mental_sessions   + CASE WHEN p_game='mental'   THEN 1 ELSE 0 END,
    corsi_sessions    = corsi_sessions    + CASE WHEN p_game='corsi'    THEN 1 ELSE 0 END,
    trail_sessions    = trail_sessions    + CASE WHEN p_game='trail'    THEN 1 ELSE 0 END,
    search_sessions   = coalesce(search_sessions, 0) + CASE WHEN p_game='search'   THEN 1 ELSE 0 END,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  UPDATE public.round_tickets SET submitted_at = now() WHERE id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  RETURN jsonb_build_object(
    'profile',     to_jsonb(v_profile),
    'xpAwarded',   v_xp,
    'totalXp',     v_profile.total_xp,
    'level',       v_new_level,
    'leveledUp',   v_new_level > v_old_level,
    'decayedDays', v_idle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text)
  TO service_role;

-- 3. Update get_daily_quests to rely on recorded_at
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
  -- Lọc 20 ván offline_sync sớm nhất trong ngày
  -- cùng với toàn bộ ván online
  valid_sessions AS (
    SELECT * FROM (
      SELECT s.*, 
        row_number() OVER (PARTITION BY (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, s.provenance ORDER BY s.recorded_at ASC) as offline_rank
      FROM public.training_sessions s, p
      WHERE s.user_id = auth.uid()
        AND s.recorded_at >= p.stats_epoch
    ) q
    WHERE provenance = 'online' OR (provenance = 'offline_sync' AND offline_rank <= 20)
  ),
  daily AS (
    SELECT s.*
    FROM valid_sessions s, clock c
    WHERE (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = c.today
  ),
  weekly AS (
    SELECT s.*
    FROM valid_sessions s, clock c
    WHERE (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= c.week_start
      AND (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < c.week_start + 7
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
