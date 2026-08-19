SET lock_timeout = '2s';
-- ==============================================================================
-- 20260918000001_phase12_decay_db.sql
-- ==============================================================================

-- 1. Hàm tính effective_rating với decay (hỗ trợ double precision / numeric)
CREATE OR REPLACE FUNCTION public.effective_rating(
  p_current_score double precision,
  p_peak_score integer,
  p_idle_days double precision
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_current double precision := COALESCE(p_current_score, 0);
  v_peak double precision := COALESCE(p_peak_score, 0)::double precision;
  v_idle double precision := GREATEST(COALESCE(p_idle_days, 0), 0);
  v_floor integer;
  v_decay integer;
BEGIN
  -- Không giảm thấp hơn 35% điểm đỉnh
  v_floor := FLOOR(v_peak * 0.35)::integer;

  IF v_current <= v_floor THEN
    RETURN ROUND(v_current)::integer;
  END IF;

  IF v_idle <= 14 THEN
    RETURN ROUND(v_current)::integer;
  END IF;

  -- Từ ngày 15 trở đi giảm 1% mỗi ngày
  v_decay := FLOOR(
    v_current * ((v_idle - 14) * 0.01)
  )::integer;

  RETURN GREATEST(
    v_floor,
    ROUND(v_current - v_decay)::integer
  );
END;
$$;

-- Overload hỗ trợ numeric
CREATE OR REPLACE FUNCTION public.effective_rating(
  p_current_score numeric,
  p_peak_score numeric,
  p_idle_days numeric
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.effective_rating(p_current_score::double precision, p_peak_score::integer, p_idle_days::double precision);
$$;

-- 2. Hàm tính cognitive_index dưới DB
CREATE OR REPLACE FUNCTION public.compute_cognitive_index(
  p_focus int,
  p_speed int,
  p_memory int,
  p_spatial int,
  p_logic int
) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_arr int[] := ARRAY[p_focus, p_speed, p_memory, p_spatial, p_logic];
  v_valid int := 0;
  v_sum int := 0;
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    IF v_arr[i] > 0 THEN
      v_valid := v_valid + 1;
      v_sum := v_sum + v_arr[i];
    END IF;
  END LOOP;
  
  IF v_valid = 0 THEN RETURN 0; END IF;
  
  -- Trung bình cộng nhân với log(1.5 + valid) / log(6.5) để phạt tài khoản ít trục
  RETURN floor((v_sum::float / v_valid) * (ln(1.5 + v_valid) / ln(6.5)));
END;
$$;

-- 3. Cập nhật view cho friend_leaderboard
DROP VIEW IF EXISTS public.friend_leaderboard;
CREATE VIEW public.friend_leaderboard AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  public.compute_cognitive_index(
    public.effective_rating(p.focus_score, p.peak_rating_focus, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.speed_score, p.peak_rating_speed, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.memory_score, p.peak_rating_memory, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision)
  ) as cognitive_index
FROM public.profiles p
WHERE p.role = 'user';
