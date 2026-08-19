-- AI Review Phase 38: Round Tickets State Machine & Server-bound Config

-- 1. Add Config & Seed columns
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS challenge_seed text,
  ADD COLUMN IF NOT EXISTS challenge_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1;

-- 2. Add State Machine columns
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'issued'
    CHECK (state IN ('issued', 'processing', 'accepted', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS processing_token uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Set default states for existing tickets
UPDATE public.round_tickets SET state = 'accepted' WHERE submitted_at IS NOT NULL AND state = 'issued';
UPDATE public.round_tickets SET state = 'expired' WHERE submitted_at IS NULL AND expires_at < now() AND state = 'issued';

-- 3. Rewrite submit_round_transaction
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version integer default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null,
  p_processing_token uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date;
  v_profile record;
  v_ticket record;
  v_recent integer;
  v_streak integer;
  v_xp integer := 0;
  v_today_xp integer := 0;
  v_old_xp integer;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'ticket_not_yours'; END IF;
    IF v_ticket.state <> 'processing' THEN RAISE EXCEPTION 'ticket_not_processing'; END IF;
    IF p_processing_token IS NOT NULL AND v_ticket.processing_token <> p_processing_token THEN
      RAISE EXCEPTION 'invalid_processing_token';
    END IF;
  ELSE
    -- For offline sync, mock the ticket fields
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  -- Lock profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today_xp := coalesce((
    SELECT sum(xp_awarded) FROM public.xp_events
    WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
  ), 0);

  IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
    v_xp := 0;
  ELSIF v_today_xp < 500 THEN
    v_xp := LEAST(CASE WHEN p_provenance = 'online' THEN 10 ELSE 2 END, 500 - v_today_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, source_key, stats_generation)
    VALUES (p_user_id, p_game, p_round_score, v_xp, coalesce(p_ticket_id::text, gen_random_uuid()::text), v_profile.stats_generation);
  END IF;

  INSERT INTO public.training_sessions(
    ticket_id, user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    CASE WHEN p_provenance = 'online' THEN p_ticket_id ELSE NULL END, 
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  v_new_level := public.calculate_level(v_old_xp + v_xp);

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.spatial_score, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  IF p_provenance = 'online' THEN
    v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
    v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
    v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
    v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
    v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);
  ELSE
    v_speed := coalesce(v_profile.speed_score, 0);
    v_focus := coalesce(v_profile.focus_score, 0);
    v_spatial := coalesce(v_profile.spatial_score, 0);
    v_logic := coalesce(v_profile.algebraic_logic_score, 0);
    v_memory := coalesce(v_profile.memory_score, 0);
  END IF;

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
    v_streak := coalesce(v_streak, 0) + 1;
  ELSIF v_recent = 0 THEN
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET
    total_xp = v_old_xp + v_xp,
    level = v_new_level,
    last_active_date = now(),
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    spatial_score = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_speed, 0), v_speed) ELSE peak_rating_speed END,
    peak_rating_focus = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_focus, 0), v_focus) ELSE peak_rating_focus END,
    peak_rating_spatial = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_spatial, 0), v_spatial) ELSE peak_rating_spatial END,
    peak_rating_logic = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_logic, 0), v_logic) ELSE peak_rating_logic END,
    peak_rating_memory = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_memory, 0), v_memory) ELSE peak_rating_memory END,
    cfop_spatial_record = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(cfop_spatial_record, 0), p_round_score) ELSE cfop_spatial_record END
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET state = 'accepted', completed_at = now(), submitted_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + v_xp,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer, uuid) TO service_role;

-- 4. Reject Ticket function (for cheat detection)
CREATE OR REPLACE FUNCTION public.reject_round_ticket(
  p_user_id uuid,
  p_ticket_id uuid,
  p_processing_token uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.round_tickets
  SET state = 'rejected',
      submitted_at = now(),
      completed_at = now()
  WHERE id = p_ticket_id
    AND user_id = p_user_id
    AND state = 'processing'
    AND processing_token = p_processing_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_round_ticket(uuid, uuid, uuid, text) TO service_role;
