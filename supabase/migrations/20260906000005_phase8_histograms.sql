-- ==============================================================================
-- 20260906000005_phase8_histograms.sql
-- ==============================================================================
-- Migrate from AVG latency rollups to raw metrics for accurate P50/P90/P99 histograms.
-- Raw data allows precise percentile calculation in PG15+.

CREATE TABLE IF NOT EXISTS public.http_metrics_raw (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL,
  status_code integer NOT NULL,
  latency integer NOT NULL
);

ALTER TABLE public.http_metrics_raw ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.http_metrics_raw FROM public, anon, authenticated;
GRANT ALL ON TABLE public.http_metrics_raw TO service_role;

-- Update record_http_metric to insert raw data instead of rollup
CREATE OR REPLACE FUNCTION public.record_http_metric(
  p_path text,
  p_status_code integer,
  p_latency integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.http_metrics_raw (path, status_code, latency)
  VALUES (p_path, p_status_code, p_latency);
END;
$$;

-- Create cron job to cleanup raw metrics older than 7 days
SELECT cron.schedule(
  'cleanup_http_metrics_raw',
  '0 0 * * *',
  $$ DELETE FROM public.http_metrics_raw WHERE created_at < now() - interval '7 days'; $$
);
