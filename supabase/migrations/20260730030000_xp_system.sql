-- XP system: add total_xp column, xp_events table, and award_xp RPC.

alter table public.profiles
add column if not exists total_xp bigint not null default 0;

alter table public.profiles
add column if not exists reaction_sessions integer not null default 0;

create table if not exists public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  round_score integer not null,
  xp_awarded integer not null,
  created_at timestamptz not null default now(),

  constraint xp_events_game_check
    check (game in ('schulte', 'sudoku', 'stroop', 'memory', 'reaction')),
  constraint xp_events_score_check
    check (round_score between 0 and 1000),
  constraint xp_events_award_check
    check (xp_awarded between 0 and 100)
);

alter table public.xp_events enable row level security;

create policy "Users can view their own XP history"
  on public.xp_events for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists xp_events_user_idx
  on public.xp_events (user_id, created_at desc);

create or replace function public.award_xp(
  p_game text,
  p_round_score integer
)
returns table (
  total_xp bigint,
  xp_awarded integer,
  new_level integer,
  leveled_up boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_xp integer;
  v_old_xp bigint;
  v_new_xp bigint;
  v_old_level integer;
  v_new_level integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_round_score < 0 or p_round_score > 1000 then
    raise exception 'Invalid round score';
  end if;

  if p_game not in ('schulte', 'sudoku', 'stroop', 'memory', 'reaction') then
    raise exception 'Invalid game';
  end if;

  -- Rate limit: at least 3 seconds since last XP event
  if exists (
    select 1 from public.xp_events
    where user_id = v_user_id
      and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'Rate limited: too soon after last XP award';
  end if;

  -- Daily cap: 300 XP per calendar day (UTC)
  declare
    v_today_xp integer;
  begin
    select coalesce(sum(xp_awarded), 0) into v_today_xp
    from public.xp_events
    where user_id = v_user_id
      and created_at >= date_trunc('day', now());

    if v_today_xp >= 300 then
      raise exception 'Daily XP cap reached';
    end if;
  end;

  -- Calculate XP: 15 base + floor(score/50), max 35
  v_xp := least(35, 15 + floor(p_round_score / 50));
  v_xp := least(v_xp, 300 - coalesce(v_today_xp, 0));
  v_xp := greatest(v_xp, 0);

  if v_xp = 0 then
    return query select
      p.total_xp, 0,
      (-1 + floor((1 + sqrt(1 + p.total_xp / 12.5)) / 2))::integer + 1,
      false
    from public.profiles p where p.id = v_user_id;
    return;
  end if;

  -- Get old XP and level
  select total_xp into v_old_xp
  from public.profiles where id = v_user_id;

  v_old_level := (-1 + floor((1 + sqrt(1 + v_old_xp / 12.5)) / 2))::integer + 1;

  -- Insert XP event
  insert into public.xp_events (user_id, game, round_score, xp_awarded)
  values (v_user_id, p_game, p_round_score, v_xp);

  -- Update total_xp
  update public.profiles
  set total_xp = total_xp + v_xp
  where id = v_user_id
  returning total_xp into v_new_xp;

  v_new_level := (-1 + floor((1 + sqrt(1 + v_new_xp / 12.5)) / 2))::integer + 1;

  return query select
    v_new_xp, v_xp, v_new_level, (v_new_level > v_old_level);
end;
$$;

revoke all on function public.award_xp(text, integer) from public, anon;
grant execute on function public.award_xp(text, integer) to authenticated;