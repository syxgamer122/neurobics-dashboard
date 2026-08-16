-- ==============================================================================
-- 20260906000002_phase8_ledger_xp.sql
-- ==============================================================================
-- 1. Redefine admin_grant_tx to compute total_xp delta in SQL and write to xp_events.

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
  -- 1. Verify actor is admin (already checked in Edge Function but good defence in depth)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Calculate XP delta safely inside the transaction (Lock row via FOR UPDATE on profiles if needed)
  SELECT total_xp INTO v_current_xp FROM public.profiles WHERE id = p_target_id FOR UPDATE;

  IF p_context ? 'xp' THEN
    IF p_context->>'mode' = 'set' THEN
      v_xp_delta := LEAST(200000000, GREATEST(0, (p_context->>'xp')::int)) - COALESCE(v_current_xp, 0);
    ELSE
      v_xp_delta := (p_context->>'xp')::int;
    END IF;
  END IF;

  -- 3. Update profile scores and total_xp
  UPDATE public.profiles
  SET
    total_xp = LEAST(200000000, GREATEST(0, COALESCE(total_xp, 0) + v_xp_delta)),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    spatial_score = COALESCE((p_patch->>'spatial_score')::int, spatial_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record)
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  -- 4. Record the XP delta in the ledger (if any)
  IF v_xp_delta <> 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_target_id, 'admin_grant', 0, v_xp_delta);
  END IF;

  -- 5. Run achievement sync if total_xp was modified
  IF v_xp_delta <> 0 THEN
    PERFORM public.sync_achievements_for(p_target_id);
  END IF;

  -- 6. Append to admin audit
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor_id, p_target_id, 'grant', p_context, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;

-- Fix add_xp_secure to use correct xp_events schema
CREATE OR REPLACE FUNCTION public.add_xp_secure(p_user_id uuid, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_xp int;
BEGIN
    UPDATE public.profiles
    SET total_xp = LEAST(200000000, GREATEST(0, COALESCE(total_xp, 0) + p_delta))
    WHERE id = p_user_id
    RETURNING total_xp INTO v_new_xp;
    
    IF p_delta <> 0 THEN
        INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
        VALUES (p_user_id, 'admin_grant', 0, p_delta);
    END IF;

    RETURN v_new_xp;
END;
$$;
