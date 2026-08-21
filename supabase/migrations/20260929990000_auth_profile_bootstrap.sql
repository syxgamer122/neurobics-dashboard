-- ==============================================================================
-- 20260929990000_auth_profile_bootstrap.sql
-- Standalone Auth & Profile Bootstrap RPCs (Zero Dependency on Views)
-- ==============================================================================

SET lock_timeout = '2s';

BEGIN;

-- ============================================================
-- 1. get_my_profile: không phụ thuộc profiles_decayed
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
  SELECT p.*
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.id = auth.uid()
  LIMIT 1;
$body$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

-- ============================================================
-- 2. ensure_my_profile: sửa tài khoản Auth bị thiếu
-- ============================================================

DROP FUNCTION IF EXISTS public.ensure_my_profile();

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_user_metadata jsonb;
  v_app_metadata jsonb;
  v_username text;
  v_role text := 'user';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_uid
  ) THEN
    SELECT
      u.email,
      COALESCE(u.raw_user_meta_data, '{}'::jsonb),
      COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO
      v_email,
      v_user_metadata,
      v_app_metadata
    FROM auth.users AS u
    WHERE u.id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Authenticated user not found' USING ERRCODE = 'P0002';
    END IF;

    -- Ưu tiên phần trước @ của email Auth vì đây là username canonical.
    v_username := lower(
      COALESCE(
        NULLIF(split_part(v_email, '@', 1), ''),
        NULLIF(btrim(v_user_metadata ->> 'username'), ''),
        'user-' || substr(replace(v_uid::text, '-', ''), 1, 8)
      )
    );

    v_username := regexp_replace(
      v_username,
      '[^a-z0-9_.-]+',
      '-',
      'g'
    );

    v_username := left(btrim(v_username, '-.'), 20);

    IF length(v_username) < 3 THEN
      v_username := 'user-' || substr(replace(v_uid::text, '-', ''), 1, 8);
    END IF;

    -- Không cho orphan chiếm username đang được dùng.
    IF EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE lower(p.username) = lower(v_username)
        AND p.id <> v_uid
    ) THEN
      v_username := 'user-' || substr(replace(v_uid::text, '-', ''), 1, 8);
    END IF;

    IF (v_app_metadata ->> 'initial_role') = 'guest' OR v_username LIKE 'guest-%' THEN
      v_role := 'guest';
    END IF;

    INSERT INTO public.profiles (
      id,
      username,
      role
    )
    VALUES (
      v_uid,
      v_username,
      v_role
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.profiles AS p
  WHERE p.id = v_uid
  LIMIT 1;
END;
$body$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
