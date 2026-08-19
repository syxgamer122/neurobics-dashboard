-- Phase 26: SECURITY DEFINER Hardening and Player Search Privacy

BEGIN;

-- 1. Add privacy control to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS search_visible boolean DEFAULT true NOT NULL;

-- 2. Update search_players with privacy, rate limits, and search_path hardening
CREATE OR REPLACE FUNCTION public.search_players(p_query text, p_limit integer default 10)
RETURNS table (id uuid, username text, avatar_url text, cognitive_index double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 15 searches per 5 minutes per user
  IF NOT public.check_rate_limit('search_' || auth.uid()::text, 15, 300) THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = '42900';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_url, p.cognitive_index
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND p.search_visible = true
    AND length(coalesce(trim(p_query), '')) >= 2
    AND p.username ILIKE '%' || trim(p_query) || '%'
  ORDER BY p.cognitive_index DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 10), 25));
END;
$body$;

REVOKE ALL ON FUNCTION public.search_players(text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_players(text, integer) TO authenticated;

-- 3. Harden other SECURITY DEFINER functions with SET search_path = ''
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_user uuid := auth.uid();
  v_existing public.friendships;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_target IS NULL OR p_target = v_user THEN RAISE EXCEPTION 'Invalid target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT * INTO v_existing FROM public.friendships f
  WHERE least(f.requester_id, f.addressee_id) = least(v_user, p_target)
    AND greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_target);

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'Already friends';
    ELSIF v_existing.status = 'pending' THEN
      IF v_existing.addressee_id = v_user THEN
        UPDATE public.friendships SET status = 'accepted' WHERE id = v_existing.id;
        RETURN jsonb_build_object('status', 'accepted');
      ELSE
        RAISE EXCEPTION 'Request already pending';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (v_user, p_target, 'pending');

  RETURN jsonb_build_object('status', 'pending');
END;
$body$;
REVOKE ALL ON FUNCTION public.send_friend_request(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

COMMIT;
