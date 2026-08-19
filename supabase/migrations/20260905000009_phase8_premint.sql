SET lock_timeout = '2s';
-- ADR-0008: Pre-mint Ticket Pool
-- Bang luu tru ticket duoc sinh san (bang pg_cron hoac schedule ben ngoai) de giam
-- do tre khi user goi API start-round.
CREATE TABLE public.ticket_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Khong ai duoc phep doc/ghi truc tiep tu client. Chi Edge Function (service_role)
-- hoac Postgres Function moi duoc phep.
ALTER TABLE public.ticket_pool ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.start_round_with_pool(p_user_id uuid, p_game text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_started_at timestamptz;
  v_expires_at timestamptz;
BEGIN
  -- 1. Lay mot ticket da sinh san tu pool, khoa dong de tranh dung do
  WITH claimed AS (
    SELECT id FROM public.ticket_pool LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.ticket_pool WHERE id IN (SELECT id FROM claimed)
  RETURNING id INTO v_ticket_id;

  -- 2. Fallback neu pool can kiet (sinh dong tren memory cua Postgres)
  IF v_ticket_id IS NULL THEN
    PERFORM public.trigger_alert('pool.exhausted', 'P1', 'Ticket pool is empty, using fallback uuid generation');
    v_ticket_id := gen_random_uuid();
  END IF;

  v_started_at := now();
  v_expires_at := v_started_at + interval '2 hours';

  -- 3. Tao round_tickets thuc su
  INSERT INTO public.round_tickets (id, user_id, game, started_at, expires_at)
  VALUES (v_ticket_id, p_user_id, p_game, v_started_at, v_expires_at);

  RETURN json_build_object(
    'id', v_ticket_id,
    'game', p_game,
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
END;
$$;

-- Ghi chu: Viec insert vao ticket_pool nen duoc thuc hien bang pg_cron
-- vd: SELECT cron.schedule('* * * * *', 'INSERT INTO public.ticket_pool (id) SELECT gen_random_uuid() FROM generate_series(1, 500) WHERE (SELECT count(*) FROM public.ticket_pool) < 2000;');
