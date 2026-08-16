-- Tieu chuan hoa luu tru metric cap phut de tinh SLO nhanh chong
CREATE TABLE public.http_metrics_minute (
  window_start timestamp with time zone NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  latency_sum integer NOT NULL DEFAULT 0,
  PRIMARY KEY (window_start, path, status_code)
);

ALTER TABLE public.http_metrics_minute ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.http_metrics_minute FROM public, anon, authenticated;
GRANT ALL ON TABLE public.http_metrics_minute TO service_role;

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
  
  INSERT INTO public.http_metrics_minute (window_start, path, status_code, request_count, latency_sum)
  VALUES (v_window_start, p_path, p_status_code, 1, p_latency)
  ON CONFLICT (window_start, path, status_code)
  DO UPDATE SET 
    request_count = http_metrics_minute.request_count + 1,
    latency_sum = http_metrics_minute.latency_sum + p_latency;
END;
$$;
