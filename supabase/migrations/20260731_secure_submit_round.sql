-- Secure, atomic round submission. Run this migration before deploying the Edge Function.
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists memory_sessions integer not null default 0;

create table if not exists public.round_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('schulte','sudoku','stroop','reaction','memory')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists round_tickets_user_idx on public.round_tickets(user_id, created_at desc);
alter table public.round_tickets enable row level security;
-- No browser policies: only the service-role Edge Function can read/write tickets.

create or replace function public.apply_round_rating(p_current integer, p_round integer)
returns integer language sql immutable strict as $$
  select case
    when p_round <= greatest(0, least(1000, p_current)) then greatest(0, least(1000, p_current))
    when p_round - greatest(0, least(1000, p_current)) <= 3 then greatest(0, least(1000, p_round))
    else least(1000, greatest(
      greatest(0, least(1000, p_current)) + 1,
      round(greatest(0, least(1000, p_current)) + 0.4 * (p_round - greatest(0, least(1000, p_current))))::integer
    ))
  end;
$$;

create or replace function public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
begin
  if p_game not in ('schulte','sudoku','stroop','reaction','memory') then raise exception 'Invalid game'; end if;
  if p_round_score < 0 or p_round_score > 1000 then raise exception 'Invalid round score'; end if;

  select * into v_ticket from public.round_tickets where id=p_ticket_id for update;
  if not found or v_ticket.user_id<>p_user_id or v_ticket.game<>p_game then raise exception 'Invalid round ticket'; end if;
  if v_ticket.submitted_at is not null then raise exception 'Round already submitted'; end if;
  if v_ticket.expires_at < now() then raise exception 'Round ticket expired'; end if;

  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  v_speed := case when p_axes ? 'speed' then public.apply_round_rating(coalesce(v_profile.speed_score,0), (p_axes->>'speed')::integer) else v_profile.speed_score end;
  v_focus := case when p_axes ? 'focus' then public.apply_round_rating(coalesce(v_profile.focus_score,0), (p_axes->>'focus')::integer) else v_profile.focus_score end;
  v_spatial := case when p_axes ? 'spatial' then public.apply_round_rating(coalesce(v_profile.cfop_spatial_record,0), (p_axes->>'spatial')::integer) else v_profile.cfop_spatial_record end;
  v_logic := case when p_axes ? 'logic' then public.apply_round_rating(coalesce(v_profile.algebraic_logic_score,0), (p_axes->>'logic')::integer) else v_profile.algebraic_logic_score end;
  v_memory := case when p_axes ? 'memory' then public.apply_round_rating(coalesce(v_profile.memory_score,0), (p_axes->>'memory')::integer) else v_profile.memory_score end;

  if v_profile.last_active_date is null then v_streak := 1;
  elsif v_profile.last_active_date = v_today then v_streak := v_profile.synapse_streak;
  elsif v_profile.last_active_date = v_today - 1 then v_streak := v_profile.synapse_streak + 1;
  else v_streak := 1;
  end if;

  select coalesce(sum(e.xp_awarded),0)::integer into v_today_xp
  from public.xp_events e
  where e.user_id=p_user_id and (e.created_at at time zone 'Asia/Ho_Chi_Minh')::date=v_today;

  v_xp := greatest(0, least(35, 15 + floor(p_round_score/50.0)::integer, 300-v_today_xp));
  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  if v_xp > 0 then
    insert into public.xp_events(user_id,game,round_score,xp_awarded) values(p_user_id,p_game,p_round_score,v_xp);
  end if;

  update public.profiles set
    speed_score=v_speed, focus_score=v_focus, cfop_spatial_record=v_spatial,
    algebraic_logic_score=v_logic, memory_score=v_memory,
    schulte_sessions=schulte_sessions + case when p_game='schulte' then 1 else 0 end,
    sudoku_sessions=sudoku_sessions + case when p_game='sudoku' then 1 else 0 end,
    stroop_sessions=stroop_sessions + case when p_game='stroop' then 1 else 0 end,
    reaction_sessions=reaction_sessions + case when p_game='reaction' then 1 else 0 end,
    memory_sessions=memory_sessions + case when p_game='memory' then 1 else 0 end,
    synapse_streak=v_streak, last_active_date=v_today, total_xp=v_old_xp+v_xp
  where id=p_user_id returning * into v_profile;

  update public.round_tickets set submitted_at=now() where id=p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  return jsonb_build_object(
    'profile',to_jsonb(v_profile), 'xpAwarded',v_xp, 'totalXp',v_profile.total_xp,
    'level',v_new_level, 'leveledUp',v_new_level>v_old_level
  );
end;
$$;

revoke all on table public.round_tickets from public, anon, authenticated;
revoke all on function public.apply_round_rating(integer,integer) from public, anon, authenticated;
revoke all on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.apply_round_rating(integer,integer) to service_role;
grant execute on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer) to service_role;


-- Client may still edit non-game profile fields such as birth_year, but all game
-- state now belongs to the trusted Edge Function/service role.
revoke update (
  algebraic_logic_score, memory_score, speed_score, focus_score,
  cfop_spatial_record, synapse_streak, last_active_date,
  schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions,
  memory_sessions, total_xp
) on public.profiles from authenticated, anon;
apply_round_rating(integer, integer)
apply_round_rating(double precision, integer)