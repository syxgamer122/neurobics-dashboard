-- ==============================================================================
-- 20260906000006_phase8_audit_rate.sql
-- ==============================================================================
-- Add status to round_tickets to track completion rate and rejection rate accurately.
-- Change cron job to update status instead of hard deleting immediately.

ALTER TABLE public.round_tickets ADD COLUMN IF NOT EXISTS status text DEFAULT 'issued';

-- Update the reclaim cron job to soft-expire tickets
SELECT cron.unschedule('reclaim_expired_tickets');
SELECT cron.schedule(
  'reclaim_expired_tickets',
  '0 * * * *',
  $$ UPDATE public.round_tickets SET status = 'expired' WHERE status = 'issued' AND submitted_at IS NULL AND expires_at < now(); $$
);

-- Hard delete after 30 days to prevent infinite growth
SELECT cron.schedule(
  'purge_old_tickets',
  '0 0 * * *',
  $$ DELETE FROM public.round_tickets WHERE created_at < now() - interval '30 days'; $$
);
