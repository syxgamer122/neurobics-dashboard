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
  VALUES (v_user, 'quest', 0, v_xp);

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
