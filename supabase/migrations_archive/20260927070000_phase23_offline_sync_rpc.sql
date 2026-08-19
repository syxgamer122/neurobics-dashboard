SET lock_timeout = '2s';
﻿BEGIN;
CREATE OR REPLACE FUNCTION public.submit_offline_round_tx(
  p_user_id uuid,
  p_client_round_id text,
  p_game text,
  p_started_at timestamptz,
  p_axes jsonb,
  p_round_score integer,
  p_label text,
  p_time_ms integer,
  p_is_hard_cheat boolean,
  p_cheat_reasons jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_res jsonb;
  f jsonb;
BEGIN
  -- 1. Insert ticket (claim client_round_id) or fail
  BEGIN
    INSERT INTO public.round_tickets (user_id, game, started_at, client_round_id)
    VALUES (p_user_id, p_game, p_started_at, p_client_round_id)
    RETURNING id INTO v_ticket_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END;

  -- 2. If it's a hard cheat, mark rejected and don't grant anything
  IF p_is_hard_cheat THEN
    UPDATE public.round_tickets SET submitted_at = now(), status = 'rejected' WHERE id = v_ticket_id;
    IF p_cheat_reasons IS NOT NULL AND jsonb_typeof(p_cheat_reasons) = 'array' THEN
      FOR f IN SELECT * FROM jsonb_array_elements(p_cheat_reasons)
      LOOP
        PERFORM public.record_cheat_flag(p_user_id, p_game, f->>'msg', 'hard', f->'detail');
      END LOOP;
    END IF;
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- 3. If soft cheats exist, record them
  IF p_cheat_reasons IS NOT NULL AND jsonb_typeof(p_cheat_reasons) = 'array' THEN
    FOR f IN SELECT * FROM jsonb_array_elements(p_cheat_reasons)
    LOOP
      PERFORM public.record_cheat_flag(p_user_id, p_game, f->>'msg', 'soft', f->'detail');
    END LOOP;
  END IF;

  -- 4. Execute the main transaction logic
  v_res := public.submit_round_transaction(p_user_id, v_ticket_id, p_game, p_axes, p_round_score, p_label, p_time_ms);
  
  -- 5. Return success
  RETURN jsonb_build_object('status', 'ok', 'ticket_id', v_ticket_id, 'result', v_res);
END;
$$;
COMMIT;
