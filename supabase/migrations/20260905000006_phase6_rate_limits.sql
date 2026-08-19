SET lock_timeout = '2s';
-- Rename signup_rate_limits to a generic rate_limits table
ALTER TABLE public.signup_rate_limits RENAME TO rate_limits;

-- Rename the column client_key to key
ALTER TABLE public.rate_limits RENAME COLUMN client_key TO key;

-- The index on client_key might be named automatically, let's explicitly rename the PK if needed
-- Usually it's signup_rate_limits_pkey. Let's rename it if it exists.
ALTER INDEX IF EXISTS signup_rate_limits_pkey RENAME TO rate_limits_pkey;

-- Create the new generic RPC function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamp with time zone;
  v_current_count integer;
BEGIN
  -- Tinh moc thoi gian cua so (lam tron xuong theo block, vi du moi 15 phut)
  -- De tranh cache thoi gian tren edge function, ta dung now() cua DB.
  -- Cach don gian: chia timestamp cho window de lam tron.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  -- Upsert: neu chua co trong cua so thi tao moi=1, neu co roi thi +1.
  insert into public.rate_limits as limits (key, window_start, attempt_count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set attempt_count = limits.attempt_count + 1
  returning attempt_count into v_current_count;

  -- Kiem tra xem co vuot han muc khong
  if v_current_count > p_limit then
    return false;
  end if;

  return true;
END;
$$;

-- Secure the new RPC
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- Drop the old RPC (don't leave dead code)
DROP FUNCTION IF EXISTS public.check_signup_rate_limit(text, integer, integer);
