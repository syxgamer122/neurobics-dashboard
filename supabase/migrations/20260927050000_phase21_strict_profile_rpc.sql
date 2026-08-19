SET lock_timeout = '2s';
﻿BEGIN;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_my_birth_year(p_birth_year smallint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_birth_year < 1900 OR p_birth_year > extract(year FROM current_date)::int - 13 THEN RAISE EXCEPTION 'invalid_birth_year' USING ERRCODE = '22023'; END IF;
  UPDATE public.profiles SET birth_year = p_birth_year WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_birth_year(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_birth_year(smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  -- Basic check for valid url or path could be added here
  UPDATE public.profiles SET avatar_url = p_avatar_url WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;


COMMIT;
