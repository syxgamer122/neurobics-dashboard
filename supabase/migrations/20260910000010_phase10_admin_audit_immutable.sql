-- 20260910000010_phase10_admin_audit_immutable.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. admin_audit True Append-Only
CREATE OR REPLACE FUNCTION public.admin_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit is immutable and append-only. Use DROP PARTITION for retention.';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_no_mutate ON public.admin_audit;
CREATE TRIGGER admin_audit_no_mutate
BEFORE UPDATE OR DELETE ON public.admin_audit
FOR EACH ROW EXECUTE FUNCTION public.admin_audit_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit FROM anon, authenticated, service_role;

-- 2. admin_reset_profile RPC for atomicity
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
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access denied';
  END IF;

  UPDATE public.profiles
  SET 
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record),
    total_xp = COALESCE((p_patch->>'total_xp')::int, total_xp),
    last_active_date = NULL,
    stats_epoch = (p_patch->>'stats_epoch')::timestamptz,
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset', '{}'::jsonb, COALESCE(p_request_id, ''));

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_profile(uuid, uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile(uuid, uuid, text, jsonb) TO service_role;
