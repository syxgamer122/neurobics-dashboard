-- ==============================================================================
-- 20260925000000_phase13_ai_audit_part2.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- 1. Redefine admin_grant_tx to write to xp_events and NOT update total_xp directly
CREATE OR REPLACE FUNCTION public.admin_grant_tx(
  p_actor_id uuid,
  p_target_id uuid,
  p_patch jsonb,
  p_context jsonb,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
  v_xp_delta int := 0;
  v_current_xp int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT coalesce(total_xp, 0) INTO v_current_xp FROM public.profiles WHERE id = p_target_id FOR UPDATE;

  IF p_patch ? 'total_xp' THEN
    v_xp_delta := (p_patch->>'total_xp')::int - v_current_xp;
  END IF;

  IF v_xp_delta <> 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_target_id, 'admin_grant', 0, v_xp_delta);
  END IF;

  UPDATE public.profiles
  SET
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record)
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  IF v_xp_delta <> 0 THEN
    PERFORM public.sync_achievements_for(p_target_id);
  END IF;

  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor_id, p_target_id, 'grant', p_context, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;


-- 2. Redefine check_xp_ledger to sum only after stats_epoch
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_mismatches int;
BEGIN
  insert into public.cron_runs (job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*) INTO v_mismatches 
    FROM public.profiles p 
    JOIN (
      SELECT e.user_id, sum(e.xp_awarded) as s 
      FROM public.xp_events e
      JOIN public.profiles p2 ON p2.id = e.user_id
      WHERE e.created_at >= coalesce(p2.stats_epoch, '1970-01-01'::timestamptz)
      GROUP BY 1
    ) x ON x.user_id = p.id 
    WHERE coalesce(p.total_xp, 0) <> coalesce(x.s, 0);

    IF v_mismatches > 0 THEN
      PERFORM public.trigger_alert('xp_ledger_mismatch', 'P1', format('Found %s users with mismatched XP!', v_mismatches));
    END IF;

    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
END;
$$;


-- 3. Redefine admin_reset_stats to only push stats_epoch (no negative xp)
CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_actor uuid,
  p_target uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('gamification.is_xp_trigger', 'true', true);
  
  UPDATE public.profiles
  SET
    total_xp = 0,
    stats_epoch = now(),
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
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
    synapse_streak = 0
  WHERE id = p_target
  RETURNING * INTO v_new_profile;
  
  PERFORM set_config('gamification.is_xp_trigger', 'false', true);

  -- Delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- Insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset_stats', '{}'::jsonb, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;


-- 4. Create profiles_decayed view as single source of truth for UI
CREATE OR REPLACE VIEW public.profiles_decayed AS
SELECT 
  p.id, p.username, p.avatar_url, p.role, p.birth_year, p.total_xp, p.last_active_date,
  p.schulte_sessions, p.sudoku_sessions, p.stroop_sessions, p.reaction_sessions, p.memory_sessions, p.nback_sessions, p.math_sessions, p.gonogo_sessions, p.mental_sessions, p.corsi_sessions, p.trail_sessions, p.search_sessions, p.created_at, p.synapse_streak, p.peak_rating_logic, p.peak_rating_focus, p.peak_rating_speed, p.peak_rating_memory, p.peak_rating_spatial, p.stats_epoch, p.is_adult, p.rating_model_version, p.flagged,
  public.effective_rating(p.focus_score, p.peak_rating_focus, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as focus_score,
  public.effective_rating(p.speed_score, p.peak_rating_speed, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as speed_score,
  public.effective_rating(p.memory_score, p.peak_rating_memory, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as memory_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as spatial_score,
  public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as algebraic_logic_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as cfop_spatial_record
FROM public.profiles p;

-- Allow authenticated users to query the view
GRANT SELECT ON public.profiles_decayed TO authenticated, service_role, anon;


-- 5. Prometheus-style Latency Metrics for System Alerts
CREATE OR REPLACE FUNCTION public.check_system_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool_size int;
  v_payload jsonb;
  v_total int;
  v_target float;
  v_p95 float;
  b100 int; b500 int; b1000 int; b2000 int; b5000 int;
BEGIN
  -- Interpolate P95 using buckets (Prometheus style) instead of sorting raw data
  SELECT count(*), 
         count(case when latency <= 100 then 1 end),
         count(case when latency <= 500 then 1 end),
         count(case when latency <= 1000 then 1 end),
         count(case when latency <= 2000 then 1 end),
         count(case when latency <= 5000 then 1 end)
  INTO v_total, b100, b500, b1000, b2000, b5000
  FROM public.http_metrics_raw
  WHERE created_at > now() - interval '15 minutes';

  IF v_total = 0 THEN
    v_p95 := 0;
  ELSE
    v_target := v_total * 0.95;
    IF v_target <= b100 THEN
      v_p95 := (v_target / NULLIF(b100, 0)) * 100;
    ELSIF v_target <= b500 THEN
      v_p95 := 100 + ((v_target - b100) / NULLIF(b500 - b100, 0)) * 400;
    ELSIF v_target <= b1000 THEN
      v_p95 := 500 + ((v_target - b500) / NULLIF(b1000 - b500, 0)) * 500;
    ELSIF v_target <= b2000 THEN
      v_p95 := 1000 + ((v_target - b1000) / NULLIF(b2000 - b1000, 0)) * 1000;
    ELSIF v_target <= b5000 THEN
      v_p95 := 2000 + ((v_target - b2000) / NULLIF(b5000 - b2000, 0)) * 3000;
    ELSE
      v_p95 := 5000;
    END IF;
  END IF;

  -- Check ticket pool size
  SELECT count(*) INTO v_pool_size FROM public.ticket_pool;

  IF coalesce(v_p95, 0) > 1000 OR v_pool_size < 500 THEN
    v_payload := jsonb_build_object(
      'message', CASE 
        WHEN v_p95 > 1000 THEN 'P95 Latency exceeded 1000ms!'
        ELSE 'Ticket pool running dangerously low!'
      END,
      'metrics', jsonb_build_object(
        'p95_latency_ms', v_p95,
        'pool_size', v_pool_size
      )
    );
    RAISE WARNING 'SYSTEM ALERT: %', v_payload;
  END IF;
END;
$$;
