SET lock_timeout = '2s';
ALTER TABLE public.xp_events 
  ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'round_award',
  ADD COLUMN IF NOT EXISTS round_id uuid;

BEGIN;

-- 1. Idempotency (Offline sync constraints)
ALTER TABLE public.round_tickets ADD CONSTRAINT round_tickets_user_client_round_unique UNIQUE (user_id, client_round_id);
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_source_unique ON public.xp_events(user_id, source_key) WHERE source_key IS NOT NULL;

-- 2. Modify admin_reset_stats to append negative XP event
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
  v_old_xp integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target;

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

  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, xp_awarded, reason, source_key)
    VALUES (p_target, -v_old_xp, 'admin_reset', 'admin_reset_' || now()::text);
  END IF;

  -- Delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- Insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset_stats', '{}'::jsonb, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;

-- 3. Modify check_xp_ledger to not filter by stats_epoch
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mismatches integer;
  v_run_id bigint;
BEGIN
  insert into public.cron_runs(job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*)
    INTO v_mismatches
    FROM public.profiles p
    LEFT JOIN (
      SELECT e.user_id, SUM(e.xp_awarded) as s 
      FROM public.xp_events e
      GROUP BY e.user_id
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

COMMIT;
