BEGIN;

-- ==============================================================================
-- 1. IDEMPOTENCY & OFFLINE FIXES
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'round_tickets_user_client_round_uq') THEN
    ALTER TABLE public.round_tickets ADD CONSTRAINT round_tickets_user_client_round_uq UNIQUE (user_id, client_round_id);
  END IF;
END $$;

ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.round_tickets(id);
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_ticket_uq ON public.training_sessions(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_round_award_uq ON public.xp_events(source_key) WHERE event_type = 'round_award' AND source_key IS NOT NULL;

-- ==============================================================================
-- 2. GENERATION/EPOCH FOR STATS (RESET FIX)
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stats_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS stats_generation bigint NOT NULL DEFAULT 0;

-- ==============================================================================
-- 3. COLUMN-LEVEL RLS
-- ==============================================================================
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT UPDATE (username, birth_year, avatar_url, locale) ON TABLE public.profiles TO authenticated;

-- ==============================================================================
-- 4. GUEST UPGRADE STATE MACHINE FIXES
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS upgrade_one_pending_per_user ON public.upgrade_operations (user_id) WHERE status = 'pending_verification';

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op public.upgrade_operations%rowtype;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    SELECT * INTO v_op FROM public.upgrade_operations 
    WHERE user_id = NEW.id AND status = 'pending_verification'
    FOR UPDATE;
    
    IF NOT FOUND THEN RETURN NEW; END IF;
    
    IF v_op.created_at < now() - interval '24 hours' THEN
      UPDATE public.upgrade_operations SET status = 'failed' WHERE id = v_op.id;
      RETURN NEW;
    END IF;
    
    IF lower(NEW.email) != lower(v_op.target_email) THEN RETURN NEW; END IF;

    UPDATE public.profiles 
    SET role = 'user', username = v_op.target_username
    WHERE id = NEW.id AND role = 'guest';
    
    UPDATE public.upgrade_operations 
    SET status = 'completed', completed_at = now() 
    WHERE id = v_op.id;
    
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 5. ATOMIC ADMIN RPCs
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_grant(
  p_target_id uuid,
  p_xp_amount integer,
  p_xp_mode text,
  p_axes jsonb,
  p_axes_mode text,
  p_reason text,
  p_admin_id uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%rowtype;
  v_old_xp integer;
  v_new_xp integer;
  v_new_level integer;
  v_patch jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

  v_old_xp := coalesce(v_profile.total_xp, 0);
  
  IF p_xp_amount IS NOT NULL THEN
    IF p_xp_mode = 'set' THEN
      v_new_xp := p_xp_amount;
    ELSE
      v_new_xp := v_old_xp + p_xp_amount;
    END IF;
    v_new_level := public.calculate_level(v_new_xp);
    
    UPDATE public.profiles SET total_xp = v_new_xp, level = v_new_level WHERE id = p_target_id;

    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, event_type, stats_generation)
    VALUES (p_target_id, 'admin_grant', 0, v_new_xp - v_old_xp, 'admin_grant', v_profile.stats_generation);
    
    v_patch := jsonb_set(v_patch, '{total_xp}', to_jsonb(v_new_xp));
  END IF;

  IF p_axes IS NOT NULL AND jsonb_typeof(p_axes) = 'object' THEN
    -- Axes update logic mapped directly to DB columns
    -- speed_score, focus_score, spatial_score, algebraic_logic_score, memory_score
    IF p_axes ? 'speed' THEN
      UPDATE public.profiles SET speed_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'speed')::integer ELSE coalesce(speed_score, 0) + (p_axes->>'speed')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{speed}', p_axes->'speed');
    END IF;
    IF p_axes ? 'focus' THEN
      UPDATE public.profiles SET focus_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'focus')::integer ELSE coalesce(focus_score, 0) + (p_axes->>'focus')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{focus}', p_axes->'focus');
    END IF;
    IF p_axes ? 'spatial' THEN
      
      v_patch := jsonb_set(v_patch, '{spatial}', p_axes->'spatial');
    END IF;
    IF p_axes ? 'logic' THEN
      UPDATE public.profiles SET algebraic_logic_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'logic')::integer ELSE coalesce(algebraic_logic_score, 0) + (p_axes->>'logic')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{logic}', p_axes->'logic');
    END IF;
    IF p_axes ? 'memory' THEN
      UPDATE public.profiles SET memory_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'memory')::integer ELSE coalesce(memory_score, 0) + (p_axes->>'memory')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{memory}', p_axes->'memory');
    END IF;
  END IF;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_admin_id, p_target_id, 'admin.grant', jsonb_build_object('reason', p_reason, 'patch', v_patch), p_request_id);

  RETURN jsonb_build_object('success', true, 'patch', v_patch);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_target_id uuid,
  p_reason text,
  p_admin_id uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%rowtype;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

  UPDATE public.profiles
  SET 
    total_xp = 0,
    level = 1,
    stats_generation = stats_generation + 1,
    synapse_streak = 0,
    speed_score = null,
    focus_score = null,
    algebraic_logic_score = null,
    memory_score = null,
    peak_rating_speed = 0,
    peak_rating_focus = 0,
    peak_rating_spatial = 0,
    peak_rating_logic = 0,
    peak_rating_memory = 0,
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
    cfop_spatial_record = 0
  WHERE id = p_target_id;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_admin_id, p_target_id, 'admin.reset_stats', jsonb_build_object('reason', p_reason, 'old_generation', v_profile.stats_generation), p_request_id);

  RETURN jsonb_build_object('success', true, 'new_generation', v_profile.stats_generation + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant(uuid, integer, text, jsonb, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant(uuid, integer, text, jsonb, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_reset_stats(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_stats(uuid, text, uuid, text) TO service_role;

COMMIT;
