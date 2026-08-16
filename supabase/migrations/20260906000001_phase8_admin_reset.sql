-- ==============================================================================
-- 20260906000001_phase8_admin_reset.sql
-- ==============================================================================
-- 1. Add stats_epoch to profiles for admin-reset logic.
-- 2. Update guest cleanup criteria.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stats_epoch timestamptz DEFAULT '1970-01-01T00:00:00Z';

-- Update the get_abandoned_guests RPC to use NOT EXISTS (SELECT 1 FROM training_sessions)
-- instead of just total_xp = 0.
CREATE OR REPLACE FUNCTION public.get_abandoned_guests()
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id 
  FROM public.profiles p
  WHERE p.role = 'guest'
    AND p.created_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.training_sessions t WHERE t.user_id = p.id
    );
$$;

-- 3. Redefine achievement_stats to filter sessions before stats_epoch
CREATE OR REPLACE FUNCTION public.achievement_stats(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT * FROM public.profiles WHERE id = p_user
  ),
  s AS (
    SELECT * FROM public.training_sessions 
    WHERE user_id = p_user 
      AND NOT COALESCE(excluded_from_stats, false)
      AND created_at >= (SELECT stats_epoch FROM p)
  ),
  w AS (
    SELECT * FROM s WHERE label IS NULL OR label NOT ILIKE '%(failed)%'
  ),
  per_game AS (
    SELECT game, count(*)::int AS n, max(round_score)::int AS best
    FROM s GROUP BY game
  )
  SELECT jsonb_build_object(
    'rounds',   COALESCE((SELECT count(*) FROM s), 0),
    'games',    COALESCE((SELECT count(DISTINCT game) FROM s), 0),
    'best',     COALESCE((SELECT max(round_score) FROM s), 0),
    'perfect',  COALESCE((SELECT count(*) FROM s WHERE round_score >= 950), 0),
    'days',     COALESCE((
                  SELECT count(DISTINCT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                  FROM s
                ), 0),
    'streak',   COALESCE((SELECT synapse_streak FROM p), 0),
    'total_xp', COALESCE((SELECT total_xp FROM p), 0),
    'level',    COALESCE((
                  SELECT floor((-1 + sqrt(1 + coalesce(total_xp,0)/12.5))/2)::int + 1 FROM p
                ), 1),
    'max_axis', COALESCE((
                  SELECT greatest(
                    coalesce(speed_score,0), coalesce(focus_score,0),
                    coalesce(memory_score,0), coalesce(algebraic_logic_score,0),
                    coalesce(cfop_spatial_record,0)
                  ) FROM p
                ), 0),
    'min_axis', COALESCE((
                  SELECT least(
                    coalesce(speed_score,0), coalesce(focus_score,0),
                    coalesce(memory_score,0), coalesce(algebraic_logic_score,0),
                    coalesce(cfop_spatial_record,0)
                  ) FROM p
                ), 0),
    'games_10',  COALESCE((SELECT count(*) FROM per_game WHERE n >= 10), 0),
    'games_600', COALESCE((SELECT count(*) FROM per_game WHERE best >= 600), 0),
    'b_schulte',  COALESCE((SELECT best FROM per_game WHERE game = 'schulte'), 0),
    'b_sudoku',   COALESCE((SELECT best FROM per_game WHERE game = 'sudoku'), 0),
    'b_stroop',   COALESCE((SELECT best FROM per_game WHERE game = 'stroop'), 0),
    'b_reaction', COALESCE((SELECT best FROM per_game WHERE game = 'reaction'), 0),
    'b_memory',   COALESCE((SELECT best FROM per_game WHERE game = 'memory'), 0),
    'b_nback',    COALESCE((SELECT best FROM per_game WHERE game = 'nback'), 0),
    'b_math',     COALESCE((SELECT best FROM per_game WHERE game = 'math'), 0),
    'b_gonogo',   COALESCE((SELECT best FROM per_game WHERE game = 'gonogo'), 0),
    'b_mental',   COALESCE((SELECT best FROM per_game WHERE game = 'mental'), 0),
    'schulte_6x6', (SELECT EXISTS(
        SELECT 1 FROM w
        WHERE game = 'schulte'
          AND COALESCE(nullif(substring(label FROM '^([0-9]+)'), '')::int, 0) >= 6
      )),
    'sudoku_extreme', (SELECT EXISTS(
        SELECT 1 FROM w WHERE game = 'sudoku' AND label ILIKE 'Extreme%'
      )),
    'nback_deep', (SELECT EXISTS(
        SELECT 1 FROM w
        WHERE game = 'nback'
          AND COALESCE(nullif(substring(label FROM '^([0-9]+)'), '')::int, 0) >= 5
      ))
  );
$$;

REVOKE ALL ON FUNCTION public.achievement_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.achievement_stats(uuid) TO authenticated, service_role;

-- 4. Redefine get_daily_quests to filter sessions before stats_epoch
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
      FROM public.quest_claims c
      WHERE c.user_id = auth.uid()
        AND c.code = d.code
        AND c.quest_day = d.period_key
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  FROM defs d
  ORDER BY d.sort_order, d.code;
$$;

REVOKE ALL ON FUNCTION public.get_daily_quests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_quests() TO authenticated;
