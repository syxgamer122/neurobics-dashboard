-- Iteration 13 Fixes

-- 1. Modify cheat_flags table
ALTER TABLE public.cheat_flags RENAME COLUMN severity TO signal_class;

-- Since severity was text, we don't necessarily need to change the type, but let's update values
UPDATE public.cheat_flags SET signal_class = 'statistical' WHERE signal_class = 'soft';
UPDATE public.cheat_flags SET signal_class = 'physical' WHERE signal_class = 'hard';

-- 2. Update record_cheat_flag
CREATE OR REPLACE FUNCTION public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_signal_class text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_round_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_signal_class NOT IN ('statistical', 'physical') THEN
    RAISE EXCEPTION 'Invalid signal_class';
  END IF;

  INSERT INTO public.cheat_flags(user_id, game, reason, signal_class, details, round_id)
  VALUES (p_user_id, NULLIF(p_game, ''), p_reason, p_signal_class, COALESCE(p_details, '{}'::jsonb), p_round_id);
END;
$$;

-- Drop the old one
DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb, uuid);

-- 3. Fix Race Condition in Ledger XP (admin_reset_stats)
CREATE OR REPLACE FUNCTION public.admin_reset_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_gen integer;
BEGIN
  -- SELECT FOR UPDATE locks the profile so concurrent finalize_accepted_round_tx or trg_xp_events_apply wait
  UPDATE public.profiles
  SET 
    total_xp = 0,
    stats_generation = stats_generation + 1
  WHERE id = p_user_id
  RETURNING stats_generation INTO v_new_gen;

  IF v_new_gen IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
END;
$$;

-- 4. Fix Race Condition in trg_xp_events_apply
CREATE OR REPLACE FUNCTION public.trg_xp_events_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gen integer;
BEGIN
  -- We read the latest stats_generation from profiles and override NEW.stats_generation
  -- We also lock the profile row to ensure we safely add XP
  SELECT stats_generation INTO v_gen
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_gen IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.stats_generation := v_gen;

  UPDATE public.profiles
  SET total_xp = total_xp + NEW.xp_awarded
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;
