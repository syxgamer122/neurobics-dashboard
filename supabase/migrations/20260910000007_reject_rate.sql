SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000007_reject_rate.sql
-- ==============================================================================

-- 1. Add columns to cheat_flags
alter table public.cheat_flags
add column if not exists round_id uuid,
add column if not exists review_status text not null default 'pending';

-- Add constraints
alter table public.cheat_flags drop constraint if exists cheat_flags_review_status_check;
alter table public.cheat_flags
add constraint cheat_flags_review_status_check
check (review_status in ('pending', 'confirmed', 'false_positive'));

-- 2. Update record_cheat_flag to include round_id
create or replace function public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_severity text default 'soft',
  p_details jsonb default '{}'::jsonb,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_penalty integer;
  v_trust integer;
  v_flagged boolean;
begin
  if p_severity not in ('soft', 'hard') then
    raise exception 'Invalid severity';
  end if;

  insert into public.cheat_flags(user_id, game, reason, severity, details, round_id)
  values (p_user_id, nullif(p_game, ''), p_reason, p_severity,
          coalesce(p_details, '{}'::jsonb), p_round_id);

  v_penalty := case when p_severity = 'hard' then 25 else 8 end;

  update public.profiles
  set trust_score = greatest(0, trust_score - v_penalty)
  where id = p_user_id
  returning trust_score into v_trust;

  v_flagged := v_trust = 0;

  if v_flagged then
    update public.profiles
    set flagged = true,
        flag_reason = p_reason
    where id = p_user_id and flagged = false;
  end if;

  return json_build_object(
    'trust_score', v_trust,
    'flagged', v_flagged,
    'penalty', v_penalty
  );
end;
$$;

-- 3. Update get_cheat_flags RPC
drop function if exists public.get_cheat_flags(integer);
create or replace function public.get_cheat_flags(p_limit integer default 50)
returns table(
  id uuid,
  user_id uuid,
  username text,
  game text,
  reason text,
  severity text,
  details jsonb,
  trust_score integer,
  flagged boolean,
  created_at timestamptz,
  round_id uuid,
  review_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  return query
  select
    f.id, f.user_id, p.username, f.game, f.reason, f.severity, f.details,
    p.trust_score, p.flagged, f.created_at, f.round_id, f.review_status
  from public.cheat_flags f
  left join public.profiles p on p.id = f.user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_cheat_flags(integer) from public, anon;
grant execute on function public.get_cheat_flags(integer) to authenticated;
