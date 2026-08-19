-- AI Review: Make admin_reset_stats increment stats_generation
CREATE OR REPLACE FUNCTION public.admin_reset_stats_tx(
  p_target uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation bigint;
BEGIN
  -- Tang stats_generation và reset các tr?c
  UPDATE public.profiles
  SET
    stats_generation = stats_generation + 1,
    total_xp = 0,
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    spatial_score = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    last_active_date = now(),
    last_activity_at = now()
  WHERE id = p_target
  RETURNING stats_generation INTO v_generation;

  -- Ghi admin audit
  INSERT INTO public.admin_audit (actor_id, target_id, action, details)
  VALUES (p_actor, p_target, 'reset', jsonb_build_object('new_generation', v_generation));
END;
$$;
