-- 1. Add excluded_from_stats to training_sessions
ALTER TABLE public.training_sessions 
ADD COLUMN IF NOT EXISTS excluded_from_stats boolean DEFAULT false;

-- 2. Add excluded_from_stats to xp_events
ALTER TABLE public.xp_events
ADD COLUMN IF NOT EXISTS excluded_from_stats boolean DEFAULT false;

-- 3. Redefine achievement_stats to filter out excluded sessions
-- This prevents sync_achievements from re-awarding badges and XP after an admin reset.
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
  ),
  -- Ván THẮNG: Schulte/Sudoku thua được gắn hậu tố "(failed)" vào label.
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
    -- Đủ chiều rộng: bao nhiêu game đã chơi ≥ 10 ván / đạt ≥ 600 điểm.
    'games_10',  COALESCE((SELECT count(*) FROM per_game WHERE n >= 10), 0),
    'games_600', COALESCE((SELECT count(*) FROM per_game WHERE best >= 600), 0),
    -- Best từng game
    'b_schulte',  COALESCE((SELECT best FROM per_game WHERE game = 'schulte'), 0),
    'b_sudoku',   COALESCE((SELECT best FROM per_game WHERE game = 'sudoku'), 0),
    'b_stroop',   COALESCE((SELECT best FROM per_game WHERE game = 'stroop'), 0),
    'b_reaction', COALESCE((SELECT best FROM per_game WHERE game = 'reaction'), 0),
    'b_memory',   COALESCE((SELECT best FROM per_game WHERE game = 'memory'), 0),
    'b_nback',    COALESCE((SELECT best FROM per_game WHERE game = 'nback'), 0),
    'b_math',     COALESCE((SELECT best FROM per_game WHERE game = 'math'), 0),
    'b_gonogo',   COALESCE((SELECT best FROM per_game WHERE game = 'gonogo'), 0),
    'b_mental',   COALESCE((SELECT best FROM per_game WHERE game = 'mental'), 0),
    -- Mốc đặc biệt (chỉ tính ván thắng)
    -- Schulte label: '6×6 Classic' → lấy số đầu chuỗi, không phụ thuộc ký tự ×.
    'schulte_6x6', (SELECT EXISTS(
        SELECT 1 FROM w
        WHERE game = 'schulte'
          AND COALESCE(nullif(substring(label FROM '^([0-9]+)'), '')::int, 0) >= 6
      )),
    'sudoku_extreme', (SELECT EXISTS(
        SELECT 1 FROM w WHERE game = 'sudoku' AND label ILIKE 'Extreme%'
      )),
    -- N-Back label: '5-Back' trở lên mới tính là "sâu".
    'nback_deep', (SELECT EXISTS(
        SELECT 1 FROM w
        WHERE game = 'nback'
          AND COALESCE(nullif(substring(label FROM '^([0-9]+)'), '')::int, 0) >= 5
      ))
  );
$$;

REVOKE ALL ON FUNCTION public.achievement_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.achievement_stats(uuid) TO authenticated, service_role;
