-- AI Review: Separate offline practice physically
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_round_id uuid UNIQUE NOT NULL,
  game text NOT NULL,
  round_score integer NOT NULL,
  practice_xp_awarded integer NOT NULL DEFAULT 0,
  time_ms integer NOT NULL,
  speed_score integer,
  focus_score integer,
  spatial_score integer,
  logic_score integer,
  memory_score integer,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.submit_offline_practice_tx(
  p_user_id uuid,
  p_client_round_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_time_ms integer,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_practice_xp integer := 0;
  v_xp integer := 0;
BEGIN
  -- Strict idempotency via ON CONFLICT
  INSERT INTO public.practice_sessions (
    user_id, client_round_id, game, round_score, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    occurred_at
  )
  VALUES (
    p_user_id, p_client_round_id, p_game, p_round_score, p_time_ms,
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_occurred_at
  )
  ON CONFLICT (client_round_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  -- Practice XP Calculation (max 30 per day, 2 per round)
  v_today_practice_xp := coalesce((
    SELECT sum(practice_xp_awarded) FROM public.practice_sessions
    WHERE user_id = p_user_id 
      AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ), 0);

  IF v_today_practice_xp < 30 THEN
    v_xp := LEAST(2, 30 - v_today_practice_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    UPDATE public.practice_sessions SET practice_xp_awarded = v_xp WHERE client_round_id = p_client_round_id;
    UPDATE public.profiles SET practice_xp = coalesce(practice_xp, 0) + v_xp WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'practiceXpAwarded', v_xp);
END;
$$;
