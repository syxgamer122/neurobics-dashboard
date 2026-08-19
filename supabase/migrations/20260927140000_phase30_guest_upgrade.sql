BEGIN;

-- 1. Create upgrade_operations table for the state machine
CREATE TABLE IF NOT EXISTS public.upgrade_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  target_username text NOT NULL,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Unique index to prevent multiple pending upgrades for the same user
CREATE UNIQUE INDEX IF NOT EXISTS upgrade_operations_user_pending_idx ON public.upgrade_operations (user_id) WHERE status = 'pending_verification';

-- 2. Create unique index for username to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_ci_unique ON public.profiles (lower(username));

-- 3. Trigger to finalize upgrade upon email confirmation
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if email just became confirmed
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Update profile role from guest to user
    UPDATE public.profiles 
    SET role = 'user' 
    WHERE id = NEW.id AND role = 'guest';
    
    -- Mark operation as completed
    UPDATE public.upgrade_operations 
    SET status = 'completed', completed_at = now() 
    WHERE user_id = NEW.id AND status = 'pending_verification';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_user_email_confirmation();

COMMIT;
