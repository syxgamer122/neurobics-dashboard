SET lock_timeout = '2s';
-- 1. Create public_leaderboard view and restrict profiles SELECT RLS
DROP VIEW IF EXISTS public.public_leaderboard;

CREATE VIEW public.public_leaderboard AS
SELECT 
    id, 
    username, 
    avatar_url, 
    total_xp,
    -- Add any other non-PII columns needed for leaderboards
    algebraic_logic_score,
    memory_score,
    speed_score,
    focus_score,
    cfop_spatial_record,
    last_active_date,
    schulte_sessions,
    sudoku_sessions,
    stroop_sessions,
    reaction_sessions,
    memory_sessions,
    nback_sessions,
    math_sessions,
    gonogo_sessions,
    mental_sessions,
    corsi_sessions,
    trail_sessions,
    search_sessions,
    created_at
FROM public.profiles;

GRANT SELECT ON public.public_leaderboard TO authenticated, anon;

-- Drop the old overly permissive policy and create a strict one
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can only select their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- 2. Fix admin_audit foreign keys to ON DELETE SET NULL
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_target_id_fkey;
ALTER TABLE public.admin_audit ADD CONSTRAINT admin_audit_target_id_fkey 
    FOREIGN KEY (target_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_actor_id_fkey;
ALTER TABLE public.admin_audit ADD CONSTRAINT admin_audit_actor_id_fkey 
    FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Atomic XP increment RPC
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
    
    RETURN v_new_xp;
END;
$$;

-- Only service_role should call this directly (Edge Functions)
REVOKE EXECUTE ON FUNCTION public.add_xp_secure(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_xp_secure(uuid, int) TO service_role;

-- 4. RPC for abandoned guests to avoid deleting upgraded accounts
CREATE OR REPLACE FUNCTION public.get_abandoned_guests()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT p.id 
    FROM public.profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE p.role = 'guest'
      AND u.email LIKE 'guest-%@mindgem.local'
      AND p.created_at < now() - interval '30 days'
      AND NOT EXISTS (
          SELECT 1 FROM public.training_sessions t WHERE t.user_id = p.id
      );
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_guests() TO service_role;
