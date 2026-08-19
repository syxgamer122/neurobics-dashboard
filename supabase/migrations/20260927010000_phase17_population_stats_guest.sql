SET lock_timeout = '2s';
CREATE OR REPLACE FUNCTION public.get_population_stats(p_min_rounds integer default 5)
RETURNS table(mean double precision, sd double precision, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH calibrated AS (
    SELECT cognitive_index as idx
    FROM public.profiles_decayed
    WHERE NOT flagged AND role != 'guest'
      AND (
        coalesce(schulte_sessions, 0)
        + coalesce(sudoku_sessions, 0)
        + coalesce(stroop_sessions, 0)
        + coalesce(reaction_sessions, 0)
        + coalesce(memory_sessions, 0)
        + coalesce(nback_sessions, 0)
        + coalesce(math_sessions, 0)
        + coalesce(gonogo_sessions, 0)
        + coalesce(mental_sessions, 0)
        + coalesce(corsi_sessions, 0)
        + coalesce(trail_sessions, 0)
        + coalesce(search_sessions, 0)
      ) >= p_min_rounds
  )
  SELECT 
    coalesce(avg(idx), 380) as mean,
    coalesce(stddev_samp(idx), 180) as sd,
    count(*) as n
  FROM calibrated;
$$;
