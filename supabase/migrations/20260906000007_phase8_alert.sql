-- ==============================================================================
-- 20260906000007_phase8_alert.sql
-- ==============================================================================
-- Uses pg_cron and pg_net to call the alert-engine edge function
-- if latency is too high or ticket pool is empty.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.check_system_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_p99_latency float;
  v_pool_size int;
  v_payload jsonb;
  v_service_key text;
  v_project_url text;
BEGIN
  -- We assume standard Supabase environment variables exist in postgres
  -- If not, these would need to be stored in vault or custom parameters.
  -- For now, we build a payload and use pg_net if it's available.
  
  -- Check latency P99 over the last 15 minutes
  SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY latency)
  INTO v_p99_latency
  FROM public.http_metrics_raw
  WHERE created_at > now() - interval '15 minutes';

  -- Check ticket pool size
  SELECT count(*) INTO v_pool_size FROM public.ticket_pool;

  IF coalesce(v_p99_latency, 0) > 1000 OR v_pool_size < 500 THEN
    v_payload := jsonb_build_object(
      'message', CASE 
        WHEN v_p99_latency > 1000 THEN 'P99 Latency exceeded 1000ms!'
        ELSE 'Ticket pool running dangerously low!'
      END,
      'metrics', jsonb_build_object(
        'p99_latency_ms', v_p99_latency,
        'pool_size', v_pool_size
      )
    );

    -- Fire webhook via pg_net (requires url and anon/service key to be configured)
    -- In a real Supabase project, you would store the edge function URL and key in a vault.
    -- Here we define a placeholder that users can configure later.
    /*
    PERFORM net.http_post(
        url:='https://[PROJECT_REF].supabase.co/functions/v1/alert-engine',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_KEY]"}'::jsonb,
        body:=v_payload
    );
    */
    -- For this migration, we'll log it to Postgres logs if pg_net isn't fully configured
    RAISE WARNING 'SYSTEM ALERT: %', v_payload;
  END IF;
END;
$$;

-- Schedule the alert check every 5 minutes
SELECT cron.schedule(
  'check_system_alerts',
  '*/5 * * * *',
  $$ SELECT public.check_system_alerts(); $$
);
