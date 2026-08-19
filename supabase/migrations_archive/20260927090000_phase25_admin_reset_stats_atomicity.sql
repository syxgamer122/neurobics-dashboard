SET lock_timeout = '2s';
﻿-- Phase 25: Admin Mutation Atomicity

BEGIN;

-- 1. Redefine admin_reset_profile to be atomic and correct
CREATE OR REPLACE FUNCTION public.admin_reset_profile(
  p_target uuid,
  p_actor uuid,
  p_request_id text,
  p_patch jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_profile public.profiles;
  v_old_xp integer;
BEGIN
  -- MFA verification requirement
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' THEN
    RAISE EXCEPTION 'MFA verification required (aal2) for admin endpoints';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Admin access denied';
  END IF;

  -- FOR UPDATE to lock the profile
  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  PERFORM set_config('gamification.is_xp_trigger', 'true', true);

  UPDATE public.profiles
  SET 
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record),
    total_xp = COALESCE((p_patch->>'total_xp')::int, total_xp),
    last_active_date = NULL,
    -- Ignore stats_epoch from patch, use now()
    stats_epoch = now(),
    schulte_sessions = COALESCE((p_patch->>'schulte_sessions')::int, schulte_sessions),
    sudoku_sessions = COALESCE((p_patch->>'sudoku_sessions')::int, sudoku_sessions),
    stroop_sessions = COALESCE((p_patch->>'stroop_sessions')::int, stroop_sessions),
    reaction_sessions = COALESCE((p_patch->>'reaction_sessions')::int, reaction_sessions),
    memory_sessions = COALESCE((p_patch->>'memory_sessions')::int, memory_sessions),
    nback_sessions = COALESCE((p_patch->>'nback_sessions')::int, nback_sessions),
    math_sessions = COALESCE((p_patch->>'math_sessions')::int, math_sessions),
    gonogo_sessions = COALESCE((p_patch->>'gonogo_sessions')::int, gonogo_sessions),
    mental_sessions = COALESCE((p_patch->>'mental_sessions')::int, mental_sessions),
    corsi_sessions = COALESCE((p_patch->>'corsi_sessions')::int, corsi_sessions),
    trail_sessions = COALESCE((p_patch->>'trail_sessions')::int, trail_sessions)
  WHERE id = p_target
  RETURNING * INTO v_profile;

  -- Balance XP ledger with negative event
  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events(user_id, source_key, game, xp_awarded, delta, source)
    VALUES (p_target, 'admin_reset_' || extract(epoch from now())::text, 'admin_reset', -v_old_xp, -v_old_xp, 'admin_reset');
  END IF;

  -- delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset', '{}'::jsonb, COALESCE(p_request_id, ''));

  RETURN v_profile;
END;
$body$;

-- 2. Drop strict foreign keys on admin_audit to allow auditing deleted users
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_target_id_fkey;
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_actor_id_fkey;

COMMIT;
