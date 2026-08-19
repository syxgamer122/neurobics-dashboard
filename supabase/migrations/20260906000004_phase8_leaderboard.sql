SET lock_timeout = '2s';
-- ==============================================================================
-- 20260906000004_phase8_leaderboard.sql
-- ==============================================================================
-- Leaderboard view bypasses RLS on `profiles` because it defaults to SECURITY DEFINER.
-- We must make it SECURITY INVOKER to respect `profiles` SELECT policies.

DROP VIEW IF EXISTS public.public_leaderboard;
CREATE VIEW public.public_leaderboard WITH (security_invoker = true) AS
SELECT 
    id,
    username,
    avatar_url,
    total_xp,
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
