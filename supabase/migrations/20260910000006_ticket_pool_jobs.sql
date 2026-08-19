SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000006_ticket_pool_jobs.sql
-- ==============================================================================

-- 1. Cron job to top-up ticket pool
create or replace function public.top_up_ticket_pool()
returns void
language plpgsql
security definer
as $$
declare
  v_pool_count int;
  v_needed int;
begin
  select count(*) into v_pool_count from public.ticket_pool;
  v_needed := 2000 - v_pool_count;
  
  if v_needed > 0 then
    insert into public.ticket_pool (id)
    select gen_random_uuid() from generate_series(1, v_needed);
  end if;
end;
$$;

-- 2. Cron job to reclaim abandoned tickets (> 3 hours old)
create or replace function public.reclaim_abandoned_tickets()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete unused round_tickets that have expired
  delete from public.round_tickets
  where (status = 'unused' or status = 'abandoned')
    and expires_at < now() - interval '3 hours';
end;
$$;

-- Note: 
-- SELECT cron.schedule('top_up_ticket_pool', '*/5 * * * *', $$SELECT public.top_up_ticket_pool()$$);
-- SELECT cron.schedule('reclaim_abandoned_tickets', '0 * * * *', $$SELECT public.reclaim_abandoned_tickets()$$);
