-- ==============================================================================
-- 20260910000004_stats_epoch.sql
-- ==============================================================================

-- 1. Add stats_epoch to profiles
alter table public.profiles
add column if not exists stats_epoch timestamptz default '2000-01-01 00:00:00Z';

-- Update existing profiles to a safe default
update public.profiles
set stats_epoch = '2000-01-01 00:00:00Z'
where stats_epoch is null;

-- 2. Create RPC for Admin Reset that uses stats_epoch
create or replace function public.admin_reset_stats(p_target uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Require admin AAL2
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set
    total_xp = 0,
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    stats_epoch = now() -- The critical addition
  where id = p_target;

  insert into public.admin_audit (actor_id, action, target_id, context, request_id)
  values (auth.uid(), 'admin.reset', p_target, '{}'::jsonb, null);
end;
$$;

-- 3. Update get_abandoned_guests to use stats_epoch
CREATE OR REPLACE FUNCTION public.get_abandoned_guests()
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id 
  FROM public.profiles p
  WHERE p.role = 'guest'
    AND p.created_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.training_sessions t 
      WHERE t.user_id = p.id 
        AND t.created_at > coalesce(p.stats_epoch, '1970-01-01'::timestamptz)
    );
$$;
