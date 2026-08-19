-- ==============================================================================
-- 20260918000001_phase12_decay_db.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- 1. Hàm tính effective_rating với decay
CREATE OR REPLACE FUNCTION public.effective_rating(
  p_current_score int,
  p_peak_score int,
  p_idle_days float
) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_floor int;
  v_decay int;
BEGIN
  -- Trục 35% của đỉnh là giá trị tối thiểu không bao giờ thủng
  v_floor := floor(p_peak_score * 0.35);
  IF p_current_score <= v_floor THEN
    RETURN p_current_score;
  END IF;
  
  IF p_idle_days <= 14 THEN
    RETURN p_current_score;
  END IF;
  
  -- Mỗi ngày giảm 1%, tính từ ngày 15
  v_decay := floor(p_current_score * ((p_idle_days - 14) * 0.01));
  RETURN GREATEST(v_floor, p_current_score - v_decay);
END;
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

-- 3. Cập nhật trigger hoặc view cho leaderboard
CREATE OR REPLACE VIEW public.friend_leaderboard AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  public.compute_cognitive_index(
    public.effective_rating(p.focus_score, p.peak_rating_focus, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400),
    public.effective_rating(p.speed_score, p.peak_rating_speed, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400),
    public.effective_rating(p.memory_score, p.peak_rating_memory, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400),
    public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400),
    public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400)
  ) as cognitive_index
FROM public.profiles p
WHERE p.role = 'user'; -- Không tính guest
