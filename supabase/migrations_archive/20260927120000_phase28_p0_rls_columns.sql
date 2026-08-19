SET lock_timeout = '2s';
BEGIN;

-- 1. Revoke global UPDATE on profiles from anon and authenticated
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;

-- 2. Grant column-specific UPDATE to authenticated only for non-protected fields
GRANT UPDATE (username, birth_year, avatar_url, search_visible) ON TABLE public.profiles TO authenticated;

COMMIT;
