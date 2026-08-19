-- 20260911000001_phase11_observability_fixes.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. Add le_inf bucket and backfill
ALTER TABLE public.http_metrics_minute 
  ADD COLUMN IF NOT EXISTS le_inf integer DEFAULT 0;

UPDATE public.http_metrics_minute SET le_inf = request_count WHERE le_inf <> request_count;

ALTER TABLE public.http_metrics_minute
  ADD CONSTRAINT http_metrics_minute_buckets_check 
  CHECK (
    le_100 >= 0 AND
    le_300 >= le_100 AND
    le_500 >= le_300 AND
    le_800 >= le_500 AND
    le_2000 >= le_800 AND
    le_inf >= le_2000 AND
    le_inf = request_count
  );

-- 2. Update record_http_metric
CREATE OR REPLACE FUNCTION public.record_http_metric(
  p_path text,
  p_status_code integer,
  p_latency integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamp with time zone;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  
  INSERT INTO public.http_metrics_minute (
    window_start, path, status_code, request_count, latency_sum,
    le_100, le_300, le_500, le_800, le_2000, le_inf
  )
  VALUES (
    v_window_start, p_path, p_status_code, 1, p_latency,
    case when p_latency <= 100 then 1 else 0 end,
    case when p_latency <= 300 then 1 else 0 end,
    case when p_latency <= 500 then 1 else 0 end,
    case when p_latency <= 800 then 1 else 0 end,
    case when p_latency <= 2000 then 1 else 0 end,
    1
  )
  ON CONFLICT (window_start, path, status_code)
  DO UPDATE SET 
    request_count = http_metrics_minute.request_count + 1,
    latency_sum = http_metrics_minute.latency_sum + p_latency,
    le_100 = http_metrics_minute.le_100 + case when p_latency <= 100 then 1 else 0 end,
    le_300 = http_metrics_minute.le_300 + case when p_latency <= 300 then 1 else 0 end,
    le_500 = http_metrics_minute.le_500 + case when p_latency <= 500 then 1 else 0 end,
    le_800 = http_metrics_minute.le_800 + case when p_latency <= 800 then 1 else 0 end,
    le_2000 = http_metrics_minute.le_2000 + case when p_latency <= 2000 then 1 else 0 end,
    le_inf = http_metrics_minute.le_inf + 1;
END;
$$;
