-- Activate pg_cron extension (Supabase superuser required, typically already enabled on Supabase, but good practice to explicitly state intent, though we cannot CREATE EXTENSION here without privileges)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- For local development and CI testing, we use standard SQL functions.
-- In production Supabase, `cron.schedule` will automatically execute these.

-- 1. Create a function to clean up old observability events (30 days)
CREATE OR REPLACE FUNCTION cleanup_old_observability_events()
RETURNS void AS $$
BEGIN
  DELETE FROM observability_events
  WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a function to clean up old cheat flags (90 days)
CREATE OR REPLACE FUNCTION cleanup_old_cheat_flags()
RETURNS void AS $$
BEGIN
  DELETE FROM cheat_flags
  WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a function to clean up old admin audits (365 days)
CREATE OR REPLACE FUNCTION cleanup_old_admin_audit()
RETURNS void AS $$
BEGIN
  DELETE FROM admin_audit
  WHERE created_at < now() - interval '365 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: In a real Supabase production environment, you would schedule these
-- by running `SELECT cron.schedule(...)` in the SQL Editor as a superuser.
-- Example:
-- SELECT cron.schedule('cleanup_observability', '0 2 * * *', $$SELECT cleanup_old_observability_events()$$);
-- SELECT cron.schedule('cleanup_cheat_flags', '5 2 * * *', $$SELECT cleanup_old_cheat_flags()$$);
-- SELECT cron.schedule('cleanup_admin_audit', '10 2 * * *', $$SELECT cleanup_old_admin_audit()$$);

-- GUEST CLEANUP:
-- Inactive Guest cleanup cannot be done purely via pg_cron because auth.users
-- must be deleted via Supabase Admin API to trigger the cascade to public.profiles.
-- A Supabase Edge Function with a cron trigger handles this instead.
