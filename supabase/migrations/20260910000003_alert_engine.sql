-- ==============================================================================
-- 20260910000003_alert_engine.sql
-- ==============================================================================

-- 1. Table `alerts`
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  message text not null,
  cooldown_until timestamptz,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.alerts enable row level security;
-- Internal table, no direct client access needed

-- 2. Table `cron_runs`
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  error_details text
);

alter table public.cron_runs enable row level security;

-- 3. Function to send webhook and create alert
create or replace function public.trigger_alert(p_rule_name text, p_severity text, p_message text)
returns void
language plpgsql
security definer
as $$
declare
  v_cooldown timestamptz;
  v_webhook_url text;
begin
  -- Check cooldown
  select cooldown_until into v_cooldown
  from public.alerts
  where rule_name = p_rule_name
  order by created_at desc
  limit 1;

  if v_cooldown is not null and v_cooldown > now() then
    return; -- Still in cooldown
  end if;

  -- Insert alert (cooldown 1 hour for P1, 4 hours for others)
  insert into public.alerts (rule_name, severity, message, cooldown_until)
  values (
    p_rule_name, 
    p_severity, 
    p_message, 
    now() + (case when p_severity in ('P0', 'P1') then interval '1 hour' else interval '4 hours' end)
  );

  -- Send webhook if P1/P0 and pg_net extension is available
  -- We use current_setting to get a placeholder webhook URL or actual URL if set
  begin
    v_webhook_url := current_setting('app.slack_webhook_url', true);
    if v_webhook_url is not null and v_webhook_url != '' then
      -- Fire and forget HTTP request
      -- Assuming pg_net is enabled (supabase standard)
      -- If pg_net is not enabled, this will fail gracefully due to the EXCEPTION block
      perform net.http_post(
        url := v_webhook_url,
        body := jsonb_build_object('text', format('[%s] %s: %s', p_severity, p_rule_name, p_message))
      );
    end if;
  exception when others then
    -- Ignore network errors or missing pg_net, don't crash the transaction
  end;
end;
$$;

-- 4. Actual pg_cron job to check alerts (e.g., ticket pool)
-- Checking if ticket pool < 100
create or replace function public.check_system_health()
returns void
language plpgsql
security definer
as $$
declare
  v_run_id uuid;
  v_pool_count int;
  v_reject_rate numeric;
begin
  -- Start cron run tracking
  insert into public.cron_runs (job_name, status) values ('check_system_health', 'running') returning id into v_run_id;

  begin
    -- Rule 1: Ticket Pool Low
    select count(*) into v_pool_count from public.ticket_pool;
    if v_pool_count < 100 then
      perform public.trigger_alert('ticket_pool_low', 'P1', format('Only %s tickets available in pool!', v_pool_count));
    end if;

    -- Update cron run status
    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
end;
$$;

-- Note: In a real Supabase env, we'd run:
-- SELECT cron.schedule('check_system_health', '*/5 * * * *', $$SELECT public.check_system_health()$$);
