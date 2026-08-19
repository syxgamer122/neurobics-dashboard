SET lock_timeout = '2s';
-- 1. Profiles Column Privileges & Trigger (P0)
-- Revoke all update access from authenticated
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Grant update only on specific non-authoritative columns
GRANT UPDATE (username, avatar_url, birth_year) ON public.profiles TO authenticated;

-- Trigger to ensure score columns cannot be updated except by service_role
CREATE OR REPLACE FUNCTION public.guard_profile_scores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If the role is service_role, allow it.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Check if any score columns are being modified
  IF (NEW.total_xp, NEW.focus_score, NEW.speed_score, NEW.memory_score, NEW.cfop_spatial_record, NEW.algebraic_logic_score, NEW.cfop_spatial_record)
      IS DISTINCT FROM
     (OLD.total_xp, OLD.focus_score, OLD.speed_score, OLD.memory_score, OLD.cfop_spatial_record, OLD.algebraic_logic_score, OLD.cfop_spatial_record)
  THEN
    RAISE EXCEPTION 'Score columns are server-authoritative and cannot be directly updated.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_scores ON public.profiles;
CREATE TRIGGER trg_guard_profile_scores
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_scores();

-- 2. Offline Sync Idempotency (P0)
-- Ensure round_tickets has a unique constraint for user_id + client_round_id


-- 3. Transactional Admin Audit (P0)
-- Strict Append-Only for Admin Audit
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.admin_audit FROM authenticated, anon, service_role;

-- Pruning function (owned by postgres so it bypasses RLS/REVOKE)
CREATE OR REPLACE FUNCTION public.prune_admin_audit()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_audit WHERE created_at < now() - interval '365 days';
$$;

-- Transactional RPC for admin grants
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
BEGIN
  -- 1. Verify actor is admin (already checked in Edge Function but good defence in depth)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Update profile scores (we extract specific fields from patch)
  -- Since this is service_role execution, it bypasses the trigger block.
  UPDATE public.profiles
  SET
    total_xp = COALESCE((p_patch->>'total_xp')::int, total_xp),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record)
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  -- 3. Run achievement sync if total_xp was modified
  IF p_patch ? 'total_xp' THEN
    PERFORM public.sync_achievements_for(p_target_id);
  END IF;

  -- 4. Append to admin audit
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor_id, p_target_id, 'grant', p_context, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;
