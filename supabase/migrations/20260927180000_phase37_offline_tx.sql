BEGIN;

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
  p_cheat_reasons jsonb,
  p_scorer_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket_id uuid;
  v_res jsonb;
BEGIN
  -- Insert a mock ticket to track offline round
  -- Use ON CONFLICT to ensure idempotency if multiple syncs hit simultaneously
  INSERT INTO public.round_tickets (
    user_id,
    client_round_id,
    game,
    started_at
  )
  VALUES (
    p_user_id,
    p_client_round_id,
    p_game,
    p_started_at
  )
  ON CONFLICT (user_id, client_round_id)
  DO NOTHING
  RETURNING id INTO v_ticket_id;

  IF v_ticket_id IS NULL THEN
    -- It was already inserted, meaning a duplicate submission
    RAISE EXCEPTION 'duplicate_offline_round';
  END IF;

  IF p_is_hard_cheat THEN
    -- If it's a hard cheat, we just mark the ticket as rejected and don't score it
    UPDATE public.round_tickets 
    SET completed_at = now(), submitted_at = now(), expires_at = now() 
    WHERE id = v_ticket_id;
    
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'hard_cheat');
  END IF;

  -- Use submit_round_transaction with provenance = 'offline_sync'
  v_res := public.submit_round_transaction(
    p_user_id,
    v_ticket_id,
    p_game,
    p_axes,
    p_round_score,
    p_label,
    p_time_ms,
    1, -- p_telemetry_version
    p_scorer_version,
    1, -- p_inspector_version
    p_started_at,
    'offline_sync',
    1  -- p_shared_inspector_version
  );

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_offline_round_tx(uuid, text, text, timestamptz, jsonb, integer, text, integer, boolean, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_offline_round_tx(uuid, text, text, timestamptz, jsonb, integer, text, integer, boolean, jsonb, integer) TO service_role;

COMMIT;
