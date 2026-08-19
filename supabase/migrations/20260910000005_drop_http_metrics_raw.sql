SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000005_drop_http_metrics_raw.sql
-- ==============================================================================

-- 1. Add buckets to http_metrics_minute
alter table public.http_metrics_minute
add column if not exists le_100 integer default 0,
add column if not exists le_300 integer default 0,
add column if not exists le_500 integer default 0,
add column if not exists le_800 integer default 0,
add column if not exists le_2000 integer default 0;

-- 2. Restore record_http_metric to use http_metrics_minute with buckets
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
  -- Lam tron ve phut hien tai
  v_window_start := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  
  INSERT INTO public.http_metrics_minute (
    window_start, path, status_code, request_count, latency_sum,
    le_100, le_300, le_500, le_800, le_2000
  )
  VALUES (
    v_window_start, p_path, p_status_code, 1, p_latency,
    case when p_latency <= 100 then 1 else 0 end,
    case when p_latency <= 300 then 1 else 0 end,
    case when p_latency <= 500 then 1 else 0 end,
    case when p_latency <= 800 then 1 else 0 end,
    case when p_latency <= 2000 then 1 else 0 end
  )
  ON CONFLICT (window_start, path, status_code)
  DO UPDATE SET 
    request_count = http_metrics_minute.request_count + 1,
    latency_sum = http_metrics_minute.latency_sum + p_latency,
    le_100 = http_metrics_minute.le_100 + case when p_latency <= 100 then 1 else 0 end,
    le_300 = http_metrics_minute.le_300 + case when p_latency <= 300 then 1 else 0 end,
    le_500 = http_metrics_minute.le_500 + case when p_latency <= 500 then 1 else 0 end,
    le_800 = http_metrics_minute.le_800 + case when p_latency <= 800 then 1 else 0 end,
    le_2000 = http_metrics_minute.le_2000 + case when p_latency <= 2000 then 1 else 0 end;
END;
$$;

-- 3. Unschedule cleanup job and drop raw table
SELECT cron.unschedule('cleanup_http_metrics_raw');
DROP TABLE IF EXISTS public.http_metrics_raw;
