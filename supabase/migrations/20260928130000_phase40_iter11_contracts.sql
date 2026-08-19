-- Migration: Iteration 11 Contract Drifts
-- Phase 40

-- 1. Profiles: birth_year to birth_date
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Migrate data
UPDATE public.profiles SET birth_date = make_date(birth_year, 1, 1) WHERE birth_year IS NOT NULL AND birth_date IS NULL;

-- Drop old constraint if exists and add new one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS birth_year_min_age;
ALTER TABLE public.profiles ADD CONSTRAINT birth_date_min_age CHECK (birth_date IS NULL OR birth_date <= current_date - interval '16 years');

-- Update RLS to allow updating birth_date instead of birth_year
REVOKE UPDATE (username, birth_year, avatar_url) ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (username, birth_date, avatar_url) ON TABLE public.profiles TO authenticated;

-- Drop old column (optional, can be done later, but we drop it now)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_year;

-- 2. Round Tickets: Version Pinning and State
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'pre_mint',
  ADD COLUMN IF NOT EXISTS active_slot SMALLINT,
  ADD COLUMN IF NOT EXISTS submit_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating_model_version INTEGER,
  ADD COLUMN IF NOT EXISTS inspector_rule_set_hash TEXT,
  ADD COLUMN IF NOT EXISTS client_build_id TEXT,
  ADD COLUMN IF NOT EXISTS client_config_hash TEXT;

-- 2.5 RPC for claiming ticket (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.activate_round_ticket(
  p_user_id UUID,
  p_game TEXT,
  p_telemetry_version SMALLINT,
  p_scorer_version SMALLINT,
  p_inspector_version SMALLINT,
  p_rating_model_version INTEGER,
  p_inspector_rule_set_hash TEXT,
  p_challenge_seed TEXT,
  p_challenge_config JSONB,
  p_client_build_id TEXT,
  p_client_config_hash TEXT
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
BEGIN
  -- Claim an available pre_mint ticket
  SELECT * INTO v_ticket FROM public.round_tickets 
  WHERE state = 'pre_mint' 
  FOR UPDATE SKIP LOCKED LIMIT 1;
  
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'No available pre-minted tickets' USING ERRCODE = '55000';
  END IF;

  UPDATE public.round_tickets SET 
    state = 'activated',
    user_id = p_user_id,
    game = p_game,
    telemetry_version = p_telemetry_version,
    scorer_version = p_scorer_version,
    inspector_version = p_inspector_version,
    rating_model_version = p_rating_model_version,
    inspector_rule_set_hash = p_inspector_rule_set_hash,
    challenge_seed = p_challenge_seed,
    challenge_config = p_challenge_config,
    client_build_id = p_client_build_id,
    client_config_hash = p_client_config_hash,
    started_at = now(),
    submit_deadline = now() + interval '10 minutes'
  WHERE id = v_ticket.id RETURNING * INTO v_ticket;

  RETURN row_to_json(v_ticket);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_round_ticket FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_round_ticket TO service_role;

-- 3. Account Deletion Journal
CREATE TABLE IF NOT EXISTS public.account_deletion_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'sessions_revoked', 'storage_deleted', 'database_cleaned', 'auth_deleted', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_deletion_ops_status_idx ON public.account_deletion_operations(status);

-- 4. False Positive View
CREATE OR REPLACE VIEW public.effective_cheat_flag_review AS
SELECT DISTINCT ON (flag_id)
  flag_id as id,
  review_status,
  reviewer_id,
  reviewed_at
FROM public.cheat_flag_review_queue
WHERE review_status IS NOT NULL
ORDER BY flag_id, reviewed_at DESC;

-- 5. Revoke EXECUTE on finalize_guest_upgrade_tx
CREATE OR REPLACE FUNCTION public.finalize_guest_upgrade_tx(
  p_user_id UUID,
  p_target_email TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_op public.upgrade_operations%rowtype;
BEGIN
  -- FOR UPDATE locks the row to prevent race conditions
  SELECT * INTO v_op FROM public.upgrade_operations
  WHERE user_id = p_user_id AND target_email = p_target_email
  FOR UPDATE;

  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'No pending upgrade operation found for user.' USING ERRCODE = 'P0001';
  END IF;

  IF v_op.status != 'old_sessions_revoked' THEN
    RAISE EXCEPTION 'Cannot finalize upgrade, invalid status: %', v_op.status USING ERRCODE = 'P0002';
  END IF;

  -- Update role to user
  UPDATE public.profiles SET role = 'user' WHERE id = p_user_id;

  -- Mark operation as completed
  UPDATE public.upgrade_operations SET status = 'completed' WHERE id = v_op.id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_guest_upgrade_tx FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_guest_upgrade_tx TO service_role;
