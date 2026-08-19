-- ==============================================================================
-- 20260918000002_phase12_age_gate.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- Thêm constraint kiểm tra tuổi >= 13 cho user
ALTER TABLE public.profiles
ADD CONSTRAINT birth_year_min_age 
CHECK (birth_year IS NULL OR birth_year <= extract(year from now())::int - 13);
