-- ==============================================================================
-- 20260926000000_phase15_ai_audit_part3.sql
-- ==============================================================================

-- 1. P1-14: Age gate constraint (trigger-based to allow dynamic year)
CREATE OR REPLACE FUNCTION public.check_min_age()
RETURNS trigger AS $$
BEGIN
  IF NEW.birth_year IS NOT NULL AND NEW.birth_year > (extract(year from now())::int - 13) THEN
    RAISE EXCEPTION 'User must be at least 13 years old';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_min_age ON public.profiles;
CREATE TRIGGER trg_check_min_age
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_min_age();

-- 2. P2/P3: Exclude guests from public leaderboard
-- We also ensure it queries from profiles_decayed (the new Single Source of Truth)
CREATE OR REPLACE VIEW public.public_leaderboard AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  p.level,
  LEAST(
    ROUND((COALESCE(p.speed_score, 0) + COALESCE(p.focus_score, 0) + COALESCE(p.algebraic_logic_score, 0) + COALESCE(p.memory_score, 0) + COALESCE(p.cfop_spatial_record, 0)) / 5.0)::integer,
    (COALESCE(p.schulte_sessions, 0) + COALESCE(p.sudoku_sessions, 0) + COALESCE(p.stroop_sessions, 0) + COALESCE(p.reaction_sessions, 0) + COALESCE(p.memory_sessions, 0) + COALESCE(p.nback_sessions, 0) + COALESCE(p.math_sessions, 0) + COALESCE(p.gonogo_sessions, 0) + COALESCE(p.mental_sessions, 0) + COALESCE(p.corsi_sessions, 0) + COALESCE(p.trail_sessions, 0) + COALESCE(p.search_sessions, 0)) * 25
  ) as cognitive_index
FROM public.profiles_decayed p
WHERE NOT p.flagged AND p.role != 'guest';

GRANT SELECT ON public.public_leaderboard TO authenticated, anon;


-- 3. P2/P3: Slack webhook moved to vault
CREATE OR REPLACE FUNCTION public.check_system_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_url text;
  -- variables for latency
  v_total_rounds int;
  v_buckets jsonb;
  v_p95 float;
  v_pool_count int;
BEGIN
  -- We get webhook URL securely from vault instead of GUC
  BEGIN
    SELECT decrypted_secret INTO v_webhook_url FROM vault.decrypted_secrets WHERE name = 'slack_webhook_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_webhook_url := NULL;
  END;

  -- (The rest of the function remains the same as phase 13)
  -- Measure latency via Prometheus-style bucket interpolation (Sprint 2)
  SELECT 
    count(*),
    jsonb_build_object(
      'le_100', count(*) filter (where elapsed_ms <= 100),
      'le_500', count(*) filter (where elapsed_ms <= 500),
      'le_1000', count(*) filter (where elapsed_ms <= 1000),
      'le_2000', count(*) filter (where elapsed_ms <= 2000),
      'le_5000', count(*) filter (where elapsed_ms <= 5000)
    )
  INTO v_total_rounds, v_buckets
  FROM public.observability_events
  WHERE event_type = 'round_scored'
    AND created_at >= now() - interval '5 minutes';

  -- Calculate p95 if enough data
  IF v_total_rounds > 10 THEN
    -- Simplified interpolation logic...
    IF (v_buckets->>'le_100')::int >= v_total_rounds * 0.95 THEN v_p95 := 100;
    ELSIF (v_buckets->>'le_500')::int >= v_total_rounds * 0.95 THEN v_p95 := 500;
    ELSIF (v_buckets->>'le_1000')::int >= v_total_rounds * 0.95 THEN v_p95 := 1000;
    ELSIF (v_buckets->>'le_2000')::int >= v_total_rounds * 0.95 THEN v_p95 := 2000;
    ELSE v_p95 := 5000;
    END IF;

    IF v_p95 > 1000 THEN
      IF v_webhook_url IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_webhook_url,
          body := jsonb_build_object('text', format('[P1] High latency detected: P95 is %s ms', v_p95))
        );
      END IF;
    END IF;
  END IF;

  -- Check pool depletion
  SELECT count(*) INTO v_pool_count FROM public.ticket_pool WHERE status = 'available';
  IF v_pool_count < 100 THEN
    IF v_webhook_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_webhook_url,
        body := jsonb_build_object('text', format('[P0] Ticket pool critical: %s remaining', v_pool_count))
      );
    END IF;
  END IF;
END;
$$;


-- 4. P2/P3: Avatar bucket public + path extension check
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;

CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );
