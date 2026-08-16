-- 1. Update add_xp_secure to log to xp_events
CREATE OR REPLACE FUNCTION public.add_xp_secure(p_user_id uuid, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_xp int;
BEGIN
    UPDATE public.profiles
    SET total_xp = LEAST(200000000, GREATEST(0, COALESCE(total_xp, 0) + p_delta))
    WHERE id = p_user_id
    RETURNING total_xp INTO v_new_xp;
    
    IF p_delta <> 0 THEN
        INSERT INTO public.xp_events (user_id, source, xp_amount, created_at)
        VALUES (p_user_id, 'admin_grant', p_delta, now());
    END IF;

    RETURN v_new_xp;
END;
$$;

-- 2. Create cognitive_index Generated Function
-- This ensures the DB is the single source of truth for CI calculation
CREATE OR REPLACE FUNCTION public.cognitive_index(p public.profiles)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT LEAST(
    -- Math.round((speed + focus + logic + memory + spatial) / 5)
    ROUND(
      (
        COALESCE(p.speed_score, 0) + 
        COALESCE(p.focus_score, 0) + 
        COALESCE(p.algebraic_logic_score, 0) + 
        COALESCE(p.memory_score, 0) + 
        COALESCE(p.spatial_score, 0)
      ) / 5.0
    )::integer,
    
    -- Cap by total_sessions * 25
    (
      COALESCE(p.schulte_sessions, 0) +
      COALESCE(p.sudoku_sessions, 0) +
      COALESCE(p.stroop_sessions, 0) +
      COALESCE(p.reaction_sessions, 0) +
      COALESCE(p.memory_sessions, 0) +
      COALESCE(p.nback_sessions, 0) +
      COALESCE(p.math_sessions, 0) +
      COALESCE(p.gonogo_sessions, 0) +
      COALESCE(p.mental_sessions, 0) +
      COALESCE(p.corsi_sessions, 0) +
      COALESCE(p.trail_sessions, 0) +
      COALESCE(p.search_sessions, 0)
    ) * 25
  );
$$;

-- Update public_leaderboard view to include cognitive_index explicitly
DROP VIEW IF EXISTS public.public_leaderboard;
CREATE VIEW public.public_leaderboard AS
SELECT 
    id,
    username,
    avatar_url,
    total_xp,
    spatial_score,
    algebraic_logic_score,
    memory_score,
    speed_score,
    focus_score,
    cfop_spatial_record,
    last_active_date,
    schulte_sessions,
    sudoku_sessions,
    stroop_sessions,
    reaction_sessions,
    memory_sessions,
    nback_sessions,
    math_sessions,
    gonogo_sessions,
    mental_sessions,
    corsi_sessions,
    trail_sessions,
    search_sessions,
    created_at,
    public.cognitive_index(profiles) as cognitive_index
FROM public.profiles;

GRANT SELECT ON public.public_leaderboard TO authenticated, anon;
