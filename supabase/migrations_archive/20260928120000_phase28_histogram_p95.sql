SET lock_timeout = '2s';
-- Migration: phase28_histogram_p95
-- Description: Create shared function for p95 calculation

CREATE OR REPLACE FUNCTION public.histogram_p95(
  b100 bigint, b300 bigint, b500 bigint,
  b800 bigint, b2000 bigint, total bigint
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE target numeric := total * 0.95;
BEGIN
  IF total = 0 THEN RETURN NULL; END IF;
  IF b2000 < target THEN RETURN NULL; END IF;
  IF b100 >= target THEN RETURN 100 * target / nullif(b100, 0); END IF;
  IF b300 >= target THEN RETURN 100 + 200 * (target - b100) / nullif(b300 - b100, 0); END IF;
  IF b500 >= target THEN RETURN 300 + 200 * (target - b300) / nullif(b500 - b300, 0); END IF;
  IF b800 >= target THEN RETURN 500 + 300 * (target - b500) / nullif(b800 - b500, 0); END IF;
  RETURN 800 + 1200 * (target - b800) / nullif(b2000 - b800, 0);
END $$;
