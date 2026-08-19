-- AI Review Phase 40: Guest Upgrade State Machine Fixes

-- 1. Alter upgrade_operations status constraint
ALTER TABLE public.upgrade_operations DROP CONSTRAINT IF EXISTS upgrade_operations_status_check;
ALTER TABLE public.upgrade_operations 
  ADD CONSTRAINT upgrade_operations_status_check 
  CHECK (status IN ('pending_verification', 'email_verified', 'credentials_bound', 'old_sessions_revoked', 'completed', 'failed'));

-- 2. Add expires_at and consumed_at
ALTER TABLE public.upgrade_operations 
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- 3. Fix the trigger logic
-- We should listen for the email change. When the auth.users.email matches the target_email 
-- of a pending upgrade_operation, we advance its state.

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op record;
BEGIN
  -- When the user's email is successfully changed/confirmed, it will match the target_email
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    -- Find the pending operation
    SELECT * INTO v_op FROM public.upgrade_operations 
    WHERE user_id = NEW.id 
      AND status = 'pending_verification'
      AND target_email = NEW.email
      AND expires_at > now();
      
    IF FOUND THEN
      -- Transition to email_verified. 
      -- A backend edge function will handle binding credentials and finalising the upgrade.
      UPDATE public.upgrade_operations 
      SET status = 'email_verified' 
      WHERE id = v_op.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;
