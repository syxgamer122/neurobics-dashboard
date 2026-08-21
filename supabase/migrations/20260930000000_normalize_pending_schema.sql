SET lock_timeout = '2s';
-- ==============================================================================
-- 20260930000000_normalize_pending_schema.sql
-- Master Normalized & Consolidated Canonical Schema for Pending Phases
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------------------
-- 2. AGE GATE & PROFILE COLUMNS NORMALIZATION
-- ------------------------------------------------------------------------------
-- Age Gate Trigger: minimum age 13, only validates on INSERT or when birth_year changes
CREATE OR REPLACE FUNCTION public.check_min_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $body$
DECLARE
  v_max_birth_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer - 13;
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.birth_year IS DISTINCT FROM OLD.birth_year) 
     AND NEW.birth_year IS NOT NULL 
     AND (NEW.birth_year < 1900 OR NEW.birth_year > v_max_birth_year) THEN
    RAISE EXCEPTION 'User must be at least 13 years old' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_check_min_age ON public.profiles;
CREATE TRIGGER trg_check_min_age
BEFORE INSERT OR UPDATE OF birth_year ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_min_age();

-- Add all canonical profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rating_model_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS synapse_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rating_logic integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rating_focus integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rating_speed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rating_memory integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rating_spatial integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_epoch timestamptz DEFAULT '1970-01-01 00:00:00+00'::timestamptz,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS search_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Safe profile backfill
UPDATE public.profiles
SET 
  last_activity_at = COALESCE(last_activity_at, last_active_date::timestamptz, created_at, now()),
  level = GREATEST(1, FLOOR((-1 + SQRT(1 + GREATEST(COALESCE(total_xp, 0), 0)::numeric / 12.5)) / 2)::integer + 1),
  search_visible = COALESCE(search_visible, true)
WHERE last_activity_at IS NULL OR level IS NULL OR search_visible IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN search_visible SET DEFAULT true,
  ALTER COLUMN search_visible SET NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. XP LEDGER & SINGLE SOURCE OF TRUTH (xp_events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game text,
  round_score integer,
  xp_amount integer NOT NULL DEFAULT 0,
  xp_awarded integer NOT NULL DEFAULT 0,
  source text,
  event_type text NOT NULL DEFAULT 'round_award',
  round_id uuid,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist on xp_events
ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS game text,
  ADD COLUMN IF NOT EXISTS round_score integer,
  ADD COLUMN IF NOT EXISTS xp_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'round_award',
  ADD COLUMN IF NOT EXISTS round_id uuid,
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Canonical xp_awarded sync
UPDATE public.xp_events
SET xp_awarded = xp_amount
WHERE xp_awarded = 0 AND xp_amount <> 0;

UPDATE public.xp_events
SET xp_amount = xp_awarded
WHERE xp_amount = 0 AND xp_awarded <> 0;

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON public.xp_events (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_source_key_uq ON public.xp_events (user_id, source_key) WHERE source_key IS NOT NULL;

-- Clean up duplicate legacy triggers on xp_events
DROP TRIGGER IF EXISTS trg_xp_events_apply ON public.xp_events;
DROP TRIGGER IF EXISTS trg_apply_xp_event ON public.xp_events;
DROP FUNCTION IF EXISTS public.bump_total_xp();

-- Canonical trigger to apply xp_event to profile
CREATE OR REPLACE FUNCTION public.apply_xp_event_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_delta integer := COALESCE(NEW.xp_awarded, NEW.xp_amount, 0);
  v_new_total integer;
BEGIN
  IF v_delta = 0 THEN
    RETURN NEW;
  END IF;

  SELECT LEAST(200000000, GREATEST(0, COALESCE(p.total_xp, 0) + v_delta))::integer
  INTO v_new_total
  FROM public.profiles AS p
  WHERE p.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for XP event' USING ERRCODE = '23503';
  END IF;

  -- Bypass manual xp guard
  PERFORM set_config('gamification.is_xp_trigger', 'true', true);

  UPDATE public.profiles
  SET
    total_xp = v_new_total,
    level = GREATEST(1, FLOOR((-1 + SQRT(1 + v_new_total::numeric / 12.5)) / 2)::integer + 1),
    last_activity_at = now()
  WHERE id = NEW.user_id;

  PERFORM set_config('gamification.is_xp_trigger', 'false', true);

  RETURN NEW;
END;
$body$;

REVOKE ALL ON FUNCTION public.apply_xp_event_to_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_xp_event_to_profile() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_xp_event_to_profile() TO service_role;

CREATE TRIGGER trg_apply_xp_event
AFTER INSERT ON public.xp_events
FOR EACH ROW EXECUTE FUNCTION public.apply_xp_event_to_profile();

-- ------------------------------------------------------------------------------
-- 4. TICKET POOL & CANONICAL ROUND TICKETS STATE MACHINE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_pool
  ADD COLUMN IF NOT EXISTS game text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ticket_pool ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ticket_pool_available ON public.ticket_pool (status, created_at) WHERE status = 'available';

ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS client_round_id uuid,
  ADD COLUMN IF NOT EXISTS challenge_seed text,
  ADD COLUMN IF NOT EXISTS challenge_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS processing_token uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Update state constraint safely
ALTER TABLE public.round_tickets DROP CONSTRAINT IF EXISTS round_tickets_state_check;
ALTER TABLE public.round_tickets ADD CONSTRAINT round_tickets_state_check 
  CHECK (state IN ('issued', 'processing', 'accepted', 'rejected', 'expired'));

CREATE UNIQUE INDEX IF NOT EXISTS round_tickets_user_client_round_idx
  ON public.round_tickets (user_id, client_round_id) WHERE client_round_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 5. OFFLINE PRACTICE-ONLY (practice_sessions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_round_id uuid NOT NULL,
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
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_sessions_user_client_round_uniq UNIQUE (user_id, client_round_id)
);
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- Block direct client mutation
DROP POLICY IF EXISTS "practice_sessions_insert_own" ON public.practice_sessions;
DROP POLICY IF EXISTS "practice_sessions_select_own" ON public.practice_sessions;

CREATE POLICY "practice_sessions_select_own" ON public.practice_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.practice_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_sessions TO authenticated, service_role;

-- Server-Authoritative Offline Practice RPC
CREATE OR REPLACE FUNCTION public.submit_offline_practice_tx(
  p_client_round_id uuid,
  p_game text,
  p_round_score integer,
  p_time_ms integer,
  p_speed integer DEFAULT NULL,
  p_focus integer DEFAULT NULL,
  p_spatial integer DEFAULT NULL,
  p_logic integer DEFAULT NULL,
  p_memory integer DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_user_id uuid := auth.uid();
  v_today_xp integer := 0;
  v_awarded_xp integer := 0;
  v_rec record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Validate game & score boundaries
  IF p_game NOT IN ('schulte', 'sudoku', 'stroop', 'reaction', 'memory', 'nback', 'math', 'gonogo', 'mental', 'corsi', 'trail', 'search') THEN
    RAISE EXCEPTION 'Invalid game: %', p_game USING ERRCODE = '22023';
  END IF;

  IF p_round_score < 0 OR p_round_score > 1000 THEN
    RAISE EXCEPTION 'Invalid round score' USING ERRCODE = '22023';
  END IF;

  IF p_time_ms < 0 OR p_time_ms > 7200000 THEN
    RAISE EXCEPTION 'Invalid time_ms' USING ERRCODE = '22023';
  END IF;

  -- Check if duplicate
  IF EXISTS (SELECT 1 FROM public.practice_sessions WHERE user_id = v_user_id AND client_round_id = p_client_round_id) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'duplicate', 'client_round_id', p_client_round_id);
  END IF;

  -- Server computes practice XP (max 2 XP per round, capped at 30 XP/day)
  SELECT COALESCE(SUM(practice_xp_awarded), 0) INTO v_today_xp
  FROM public.practice_sessions
  WHERE user_id = v_user_id
    AND recorded_at >= date_trunc('day', now());

  v_awarded_xp := LEAST(2, GREATEST(0, 30 - v_today_xp));

  INSERT INTO public.practice_sessions (
    user_id, client_round_id, game, round_score, practice_xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score, occurred_at
  )
  VALUES (
    v_user_id, p_client_round_id, p_game, p_round_score, v_awarded_xp,
    p_time_ms, p_speed, p_focus, p_spatial, p_logic, p_memory, COALESCE(p_occurred_at, now())
  )
  ON CONFLICT (user_id, client_round_id) DO NOTHING
  RETURNING * INTO v_rec;

  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'duplicate', 'client_round_id', p_client_round_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'saved', 'client_round_id', p_client_round_id, 'practice_xp_awarded', v_awarded_xp);
END;
$body$;

REVOKE ALL ON FUNCTION public.submit_offline_practice_tx(uuid, text, integer, integer, integer, integer, integer, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_offline_practice_tx(uuid, text, integer, integer, integer, integer, integer, integer, integer, timestamptz) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. ANTI-CHEAT & CHEAT FLAGS (signal_class)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cheat_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game text,
  reason text NOT NULL,
  signal_class text NOT NULL DEFAULT 'statistical',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  round_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migrate severity to signal_class
ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS signal_class text;

UPDATE public.cheat_flags
SET signal_class = CASE severity
  WHEN 'hard' THEN 'physical'
  WHEN 'soft' THEN 'statistical'
  ELSE 'statistical'
END
WHERE signal_class IS NULL;

ALTER TABLE public.cheat_flags DROP CONSTRAINT IF EXISTS cheat_flags_severity_check;
ALTER TABLE public.cheat_flags ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE public.cheat_flags ALTER COLUMN signal_class SET NOT NULL;
ALTER TABLE public.cheat_flags DROP CONSTRAINT IF EXISTS cheat_flags_signal_class_check;
ALTER TABLE public.cheat_flags ADD CONSTRAINT cheat_flags_signal_class_check CHECK (signal_class IN ('statistical', 'physical'));

ALTER TABLE public.cheat_flags ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_signal_class text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_round_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_signal text;
BEGIN
  v_signal := CASE p_signal_class
    WHEN 'soft' THEN 'statistical'
    WHEN 'hard' THEN 'physical'
    ELSE p_signal_class
  END;

  IF v_signal NOT IN ('statistical', 'physical') THEN
    RAISE EXCEPTION 'Invalid signal_class: %', p_signal_class USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cheat_flags (user_id, game, reason, signal_class, details, round_id)
  VALUES (p_user_id, NULLIF(p_game, ''), p_reason, v_signal, COALESCE(p_details, '{}'::jsonb), p_round_id);
END;
$body$;

REVOKE ALL ON FUNCTION public.record_cheat_flag(uuid, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cheat_flag(uuid, text, text, text, jsonb, uuid) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. GUEST UPGRADE STATE MACHINE (ADR-0009)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.upgrade_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  state text NOT NULL DEFAULT 'pending_verification' CHECK (state IN ('pending_verification', 'email_verified', 'old_sessions_revoked', 'completed', 'expired', 'failed')),
  verification_token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.upgrade_operations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_upgrade_operations_guest ON public.upgrade_operations (guest_user_id, state);

-- ------------------------------------------------------------------------------
-- 8. MANUAL REVIEWS (Anti-cheat compensation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_id uuid REFERENCES public.cheat_flags(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  compensation_xp integer NOT NULL DEFAULT 0,
  reviewer_id uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.manual_reviews ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 9. ADMIN AUDIT & ADMIN RPCS (Append-Only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  target_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.admin_audit FROM authenticated, anon, service_role;

-- Canonical admin grant transaction (records to xp_events via ledger + admin_audit)
CREATE OR REPLACE FUNCTION public.admin_grant_tx(
  p_actor_id uuid,
  p_target_id uuid,
  p_patch jsonb,
  p_context jsonb,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_new_profile record;
  v_xp_delta integer := 0;
  v_current_xp integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(total_xp, 0) INTO v_current_xp FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_patch ? 'total_xp' THEN
    v_xp_delta := (p_patch->>'total_xp')::integer - v_current_xp;
  END IF;

  IF v_xp_delta <> 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_amount, xp_awarded, event_type, source, source_key)
    VALUES (p_target_id, 'admin_grant', 0, v_xp_delta, v_xp_delta, 'admin_grant', 'admin', 'admin_grant:' || p_request_id)
    ON CONFLICT (user_id, source_key) DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET
    focus_score = COALESCE((p_patch->>'focus_score')::integer, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::integer, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::integer, memory_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::integer, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::integer, cfop_spatial_record),
    last_activity_at = now()
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_actor_id, p_target_id, 'grant', COALESCE(p_context, '{}'::jsonb), p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_grant_tx(uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_tx(uuid, uuid, jsonb, jsonb, text) TO service_role;

-- Drop legacy reset overloads
DROP FUNCTION IF EXISTS public.admin_reset_stats(uuid);
DROP FUNCTION IF EXISTS public.admin_reset_profile(uuid, uuid, text, jsonb);

-- Canonical admin reset transaction (pushes stats_epoch, resets ratings, resets XP via negative ledger)
CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_actor uuid,
  p_target uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_new_profile record;
  v_old_xp integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(total_xp, 0) INTO v_old_xp
  FROM public.profiles
  WHERE id = p_target
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- Reset XP via ledger event
  IF v_old_xp <> 0 THEN
    INSERT INTO public.xp_events (
      user_id, game, round_score, xp_amount, xp_awarded, event_type, source, source_key
    )
    VALUES (
      p_target, 'admin_reset', 0, -v_old_xp, -v_old_xp, 'admin_reset', 'admin', 'admin_reset:' || p_request_id
    )
    ON CONFLICT (user_id, source_key) DO NOTHING;
  END IF;

  -- Reset ratings, streak, sessions, stats_epoch (XP is handled by ledger trigger)
  UPDATE public.profiles
  SET
    stats_epoch = now(),
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    peak_rating_logic = 0,
    peak_rating_focus = 0,
    peak_rating_speed = 0,
    peak_rating_memory = 0,
    peak_rating_spatial = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    synapse_streak = 0,
    last_activity_at = now()
  WHERE id = p_target
  RETURNING * INTO v_new_profile;

  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset_stats', '{}'::jsonb, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_reset_stats(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_stats(uuid, uuid, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 10. CANONICAL VIEWS & PERMISSIONS HARDENING
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_leaderboard;
DROP VIEW IF EXISTS public.profiles_decayed;

CREATE VIEW public.profiles_decayed AS
SELECT 
  p.id, 
  p.username, 
  p.avatar_url, 
  p.role, 
  p.birth_year, 
  p.birth_date,
  p.total_xp, 
  p.level, 
  p.last_active_date,
  p.schulte_sessions, 
  p.sudoku_sessions, 
  p.stroop_sessions, 
  p.reaction_sessions, 
  p.memory_sessions, 
  p.nback_sessions, 
  p.math_sessions, 
  p.gonogo_sessions, 
  p.mental_sessions, 
  p.corsi_sessions, 
  p.trail_sessions, 
  p.search_sessions, 
  p.created_at, 
  p.synapse_streak, 
  p.peak_rating_logic, 
  p.peak_rating_focus, 
  p.peak_rating_speed, 
  p.peak_rating_memory, 
  p.peak_rating_spatial, 
  p.stats_epoch, 
  (p.birth_year <= EXTRACT(YEAR FROM CURRENT_DATE)::integer - 18) AS is_adult,
  p.rating_model_version, 
  p.flagged,
  p.search_visible,
  p.last_activity_at,
  public.effective_rating(p.focus_score, p.peak_rating_focus, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as focus_score,
  public.effective_rating(p.speed_score, p.peak_rating_speed, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as speed_score,
  public.effective_rating(p.memory_score, p.peak_rating_memory, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as memory_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as spatial_score,
  public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as algebraic_logic_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision) as cfop_spatial_record,
  LEAST(
    ROUND((
      COALESCE(public.effective_rating(p.speed_score, p.peak_rating_speed, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision), 0) +
      COALESCE(public.effective_rating(p.focus_score, p.peak_rating_focus, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision), 0) +
      COALESCE(public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision), 0) +
      COALESCE(public.effective_rating(p.memory_score, p.peak_rating_memory, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision), 0) +
      COALESCE(public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, (EXTRACT(EPOCH FROM (now() - COALESCE(p.last_activity_at, p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision), 0)
    ) / 5.0)::integer,
    (COALESCE(p.schulte_sessions, 0) + COALESCE(p.sudoku_sessions, 0) + COALESCE(p.stroop_sessions, 0) + COALESCE(p.reaction_sessions, 0) + COALESCE(p.memory_sessions, 0) + COALESCE(p.nback_sessions, 0) + COALESCE(p.math_sessions, 0) + COALESCE(p.gonogo_sessions, 0) + COALESCE(p.mental_sessions, 0) + COALESCE(p.corsi_sessions, 0) + COALESCE(p.trail_sessions, 0) + COALESCE(p.search_sessions, 0)) * 25
  ) as cognitive_index
FROM public.profiles p;

-- Protect profiles_decayed from public leakage
REVOKE ALL ON public.profiles_decayed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles_decayed TO service_role;

-- Public leaderboard view (only safe columns, excludes guests & flagged)
CREATE VIEW public.public_leaderboard AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  p.level,
  p.cognitive_index
FROM public.profiles_decayed p
WHERE COALESCE(p.flagged, false) = false AND p.role != 'guest';

GRANT SELECT ON public.public_leaderboard TO authenticated, anon;

-- ------------------------------------------------------------------------------
-- 11. CANONICAL AUTH & PROFILE RPCS
-- ------------------------------------------------------------------------------
-- 1) set_my_birth_date: Secure mutation with 13+ age validation
DROP FUNCTION IF EXISTS public.set_my_birth_date(date);
CREATE OR REPLACE FUNCTION public.set_my_birth_date(p_birth_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_birth_date < date '1900-01-01' OR p_birth_date > (CURRENT_DATE - interval '13 years')::date THEN
    RAISE EXCEPTION 'Invalid birth date: user must be at least 13 years old' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET 
    birth_date = p_birth_date,
    birth_year = EXTRACT(YEAR FROM p_birth_date)::integer,
    last_activity_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$body$;

REVOKE ALL ON FUNCTION public.set_my_birth_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birth_date(date) TO authenticated, service_role;

-- 2) set_my_avatar: Secure mutation of avatar URL
DROP FUNCTION IF EXISTS public.set_my_avatar(text);
CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET 
    avatar_url = p_avatar_url,
    last_activity_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$body$;

REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 12. CANONICAL SEARCH & POPULATION STATS RPCS
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_population_stats(integer);
DROP FUNCTION IF EXISTS public.get_population_stats(integer, integer);

CREATE OR REPLACE FUNCTION public.get_population_stats(
  p_min_rounds integer DEFAULT 5,
  p_rating_model_version integer DEFAULT 1
)
RETURNS table(mean double precision, sd double precision, n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT 
    COALESCE(avg(cognitive_index), 500)::double precision as mean,
    COALESCE(stddev_pop(cognitive_index), 100)::double precision as sd,
    count(*)::bigint as n
  FROM public.profiles_decayed
  WHERE COALESCE(flagged, false) = false
    AND role <> 'guest'
    AND (
      COALESCE(schulte_sessions, 0) + COALESCE(sudoku_sessions, 0) + COALESCE(stroop_sessions, 0) +
      COALESCE(reaction_sessions, 0) + COALESCE(memory_sessions, 0) + COALESCE(nback_sessions, 0) +
      COALESCE(math_sessions, 0) + COALESCE(gonogo_sessions, 0) + COALESCE(mental_sessions, 0) +
      COALESCE(corsi_sessions, 0) + COALESCE(trail_sessions, 0) + COALESCE(search_sessions, 0)
    ) >= GREATEST(COALESCE(p_min_rounds, 5), 0)
    AND rating_model_version = p_rating_model_version;
$body$;

REVOKE ALL ON FUNCTION public.get_population_stats(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_population_stats(integer, integer) TO authenticated, anon, service_role;

-- Canonical search_players RPC
DROP FUNCTION IF EXISTS public.search_players(text, integer);
DROP FUNCTION IF EXISTS public.search_players(text);

CREATE FUNCTION public.search_players(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  total_xp integer,
  level integer,
  cognitive_index integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT
    d.id::uuid,
    d.username::text,
    d.avatar_url::text,
    COALESCE(d.total_xp, 0)::integer,
    COALESCE(d.level, 1)::integer,
    COALESCE(d.cognitive_index, 0)::integer
  FROM public.profiles_decayed AS d
  JOIN public.profiles AS p ON p.id = d.id
  WHERE auth.uid() IS NOT NULL
    AND d.id <> auth.uid()
    AND p.search_visible = true
    AND COALESCE(d.flagged, false) = false
    AND d.role <> 'guest'
    AND length(trim(COALESCE(p_query, ''))) >= 2
    AND d.username ILIKE ('%' || trim(p_query) || '%')
  ORDER BY d.total_xp DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
$body$;

REVOKE ALL ON FUNCTION public.search_players(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_players(text, integer) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 13. CRON JOBS (Safe Deficit-Based Pool Filling)
-- ------------------------------------------------------------------------------
DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'top_up_ticket_pool'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'top_up_ticket_pool',
      '* * * * *',
      $job$
        WITH pool AS (
          SELECT GREATEST(0, 500 - count(*))::integer AS missing
          FROM public.ticket_pool
          WHERE status = 'available'
        )
        INSERT INTO public.ticket_pool (id, status, created_at)
        SELECT gen_random_uuid(), 'available', now()
        FROM pool
        CROSS JOIN LATERAL generate_series(1, pool.missing);
      $job$
    );
  END IF;
END;
$do$;
