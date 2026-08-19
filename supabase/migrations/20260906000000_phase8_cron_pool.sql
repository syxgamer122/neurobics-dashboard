SET lock_timeout = '2s';
-- ==============================================================================
-- 20260906000000_phase8_cron_pool.sql
-- ==============================================================================
-- Establish pg_cron jobs for Ticket Pool maintenance as per ADR-0008.

-- Ensure pg_cron is available (Supabase generally provides this)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Top-up Ticket Pool every minute
-- Maintains a buffer of pre-minted tickets to eliminate `gen_random_uuid()` latency
-- during the critical `start-round` path.
SELECT cron.schedule(
  'top_up_ticket_pool',
  '* * * * *',
  $$ INSERT INTO public.ticket_pool (id) SELECT gen_random_uuid() FROM generate_series(1, 500) WHERE (SELECT count(*) FROM public.ticket_pool) < 2000; $$
);

-- 2. Reclaim Expired Tickets every hour
-- Cleans up `round_tickets` that were requested but never submitted,
-- keeping the table lean for efficient indexing and querying.
SELECT cron.schedule(
  'reclaim_expired_tickets',
  '0 * * * *',
  $$ DELETE FROM public.round_tickets WHERE submitted_at IS NULL AND expires_at < now() - interval '3 hours'; $$
);
