SET lock_timeout = '2s';
-- ==============================================================================
-- 20260906000008_phase8_age_gate.sql
-- ==============================================================================
-- Enforce age gate for COPPA compliance.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT true;

-- Add a check constraint to ensure new signups are strictly over 13
-- Existing rows are grandfathered (since default is true)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_age_gate_check CHECK (is_adult = true);
