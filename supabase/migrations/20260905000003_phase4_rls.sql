-- 1. Ensure strictly restricted RLS on profiles
-- Even if Phase 1 tried to fix this, we're ensuring there are NO leaky SELECT policies.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can only select their own profile" ON public.profiles;

CREATE POLICY "profiles_select_own" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = id);

-- 2. Create RPC for Admin to read any profile bypassing RLS
CREATE OR REPLACE FUNCTION public.admin_get_profile(p_target_id uuid)
RETURNS public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Enforce admin authorization
  SELECT * FROM public.profiles 
  WHERE id = p_target_id 
    AND public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_get_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_profile(uuid) TO authenticated;
