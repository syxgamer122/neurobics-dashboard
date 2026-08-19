SET lock_timeout = '2s';
-- ==============================================================================
-- 20260927110000_phase27_session_versioning.sql
-- ==============================================================================

-- 1. Ensure rating_model_version column exists on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rating_model_version integer NOT NULL DEFAULT 1;

-- 2. Update get_population_stats to filter by model version
CREATE OR REPLACE FUNCTION public.get_population_stats(
  p_min_rounds integer default 5,
  p_rating_model_version integer default 1
)
RETURNS table(mean double precision, sd double precision, n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT 
    coalesce(avg(cognitive_index), 500)::double precision as mean,
    coalesce(stddev_pop(cognitive_index), 100)::double precision as sd,
    count(*)::bigint as n
  FROM public.profiles
  WHERE (schulte_sessions + sudoku_sessions + stroop_sessions + reaction_sessions + memory_sessions + nback_sessions + math_sessions + gonogo_sessions + mental_sessions + corsi_sessions + trail_sessions + search_sessions) >= p_min_rounds
    AND rating_model_version = p_rating_model_version;
$body$;

GRANT EXECUTE ON FUNCTION public.get_population_stats(integer, integer) TO authenticated, anon;
