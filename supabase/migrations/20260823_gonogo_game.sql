-- ═══════════════════════════════════════════════════════════════════════════
-- 20260823_gonogo_game.sql
-- Game mới: Go / No-Go — ức chế phản xạ (Focus + Speed).
-- ═══════════════════════════════════════════════════════════════════════════

set local search_path = public;

-- 1) Cột đếm ván
alter table public.profiles
  add column if not exists gonogo_sessions integer not null default 0;

revoke update (gonogo_sessions) on public.profiles from authenticated, anon;

-- 2) Nới ràng buộc game
alter table public.round_tickets drop constraint if exists round_tickets_game_check;
alter table public.round_tickets
  add constraint round_tickets_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo'));

alter table public.training_sessions drop constraint if exists training_sessions_game_check;
alter table public.training_sessions
  add constraint training_sessions_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo'));

alter table public.xp_events drop constraint if exists xp_events_game_check;
alter table public.xp_events
  add constraint xp_events_game_check
  check (game in ('schulte','sudoku','stroop','memory','reaction','nback','math','gonogo','quest','achievement'));

-- 3) submit_round_transaction: nhận 'gonogo' + tăng gonogo_sessions
-- (giữ logic decay baseline 5 trục từ 20260815)
create or replace function public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0
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
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
begin
  if p_game not in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo') then
    raise exception 'Invalid game';
  end if;
  if p_round_score < 0 or p_round_score > 1000 then
    raise exception 'Invalid round score';
  end if;

  select * into v_ticket from public.round_tickets where id = p_ticket_id for update;
  if not found or v_ticket.user_id <> p_user_id or v_ticket.game <> p_game then
    raise exception 'Invalid round ticket';
  end if;
  if v_ticket.submitted_at is not null then raise exception 'Round already submitted'; end if;
  if v_ticket.expires_at < now() then raise exception 'Round ticket expired'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  select count(*)::integer into v_recent
  from public.training_sessions s
  where s.user_id = p_user_id and s.created_at > now() - interval '1 hour';

  if v_recent >= 40 then
    perform public.record_cheat_flag(
      p_user_id, p_game, 'Nộp quá nhiều ván trong một giờ', 'hard',
      jsonb_build_object('roundsLastHour', v_recent)
    );
    raise exception 'Rate limit exceeded';
  end if;

  v_idle := public.idle_days_vn(v_profile.last_active_date);

  v_base_speed   := public.decay_rating(coalesce(v_profile.speed_score, 0),           v_idle);
  v_base_focus   := public.decay_rating(coalesce(v_profile.focus_score, 0),           v_idle);
  v_base_spatial := public.decay_rating(coalesce(v_profile.cfop_spatial_record, 0),   v_idle);
  v_base_logic   := public.decay_rating(coalesce(v_profile.algebraic_logic_score, 0), v_idle);
  v_base_memory  := public.decay_rating(coalesce(v_profile.memory_score, 0),          v_idle);

  v_speed   := case when p_axes ? 'speed'   then public.apply_round_rating(v_base_speed,   (p_axes->>'speed')::integer)   else v_base_speed end;
  v_focus   := case when p_axes ? 'focus'   then public.apply_round_rating(v_base_focus,   (p_axes->>'focus')::integer)   else v_base_focus end;
  v_spatial := case when p_axes ? 'spatial' then public.apply_round_rating(v_base_spatial, (p_axes->>'spatial')::integer) else v_base_spatial end;
  v_logic   := case when p_axes ? 'logic'   then public.apply_round_rating(v_base_logic,   (p_axes->>'logic')::integer)   else v_base_logic end;
  v_memory  := case when p_axes ? 'memory'  then public.apply_round_rating(v_base_memory,  (p_axes->>'memory')::integer)  else v_base_memory end;

  v_streak := case
    when v_profile.last_active_date = v_today then coalesce(v_profile.synapse_streak, 0)
    when v_profile.last_active_date = v_today - 1 then coalesce(v_profile.synapse_streak, 0) + 1
    else 1
  end;

  select coalesce(sum(xp_awarded), 0)::integer into v_today_xp
  from public.xp_events
  where user_id = p_user_id
    and created_at >= (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and created_at <  ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');

  v_xp := greatest(0, least(100, round(p_round_score / 10.0)::integer));
  if coalesce(v_profile.flagged, false) then
    v_xp := 0;
  elsif v_today_xp + v_xp > 500 then
    v_xp := greatest(0, 500 - v_today_xp);
  end if;

  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (p_user_id, p_game, p_round_score, v_xp);
  end if;

  insert into public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score
  ) values (
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer
  );

  update public.profiles set
    speed_score = v_speed,
    focus_score = v_focus,
    cfop_spatial_record = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions  = schulte_sessions  + case when p_game='schulte'  then 1 else 0 end,
    sudoku_sessions   = sudoku_sessions   + case when p_game='sudoku'   then 1 else 0 end,
    stroop_sessions   = stroop_sessions   + case when p_game='stroop'   then 1 else 0 end,
    reaction_sessions = reaction_sessions + case when p_game='reaction' then 1 else 0 end,
    memory_sessions   = memory_sessions   + case when p_game='memory'   then 1 else 0 end,
    nback_sessions    = nback_sessions    + case when p_game='nback'    then 1 else 0 end,
    math_sessions     = math_sessions     + case when p_game='math'     then 1 else 0 end,
    gonogo_sessions   = gonogo_sessions   + case when p_game='gonogo'   then 1 else 0 end,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  where id = p_user_id
  returning * into v_profile;

  update public.round_tickets set submitted_at = now() where id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  return jsonb_build_object(
    'profile',     to_jsonb(v_profile),
    'xpAwarded',   v_xp,
    'totalXp',     v_profile.total_xp,
    'level',       v_new_level,
    'leveledUp',   v_new_level > v_old_level,
    'decayedDays', v_idle
  );
end;
$$;

revoke all on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  to service_role;

-- 4) get_population_stats: cộng gonogo_sessions vào ngưỡng hiệu chuẩn
drop function if exists public.get_population_stats(integer);
create or replace function public.get_population_stats(p_min_rounds integer default 5)
returns table(mean double precision, sd double precision, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  with calibrated as (
    select cognitive_index as idx
    from public.profiles
    where not flagged
      and (
        coalesce(schulte_sessions, 0)
        + coalesce(sudoku_sessions, 0)
        + coalesce(stroop_sessions, 0)
        + coalesce(reaction_sessions, 0)
        + coalesce(memory_sessions, 0)
        + coalesce(nback_sessions, 0)
        + coalesce(math_sessions, 0)
        + coalesce(gonogo_sessions, 0)
      ) >= greatest(1, p_min_rounds)
      and cognitive_index is not null
  )
  select
    coalesce(avg(idx), 380)::double precision as mean,
    coalesce(nullif(stddev_samp(idx), 0), 180)::double precision as sd,
    count(*)::bigint as n
  from calibrated;
$$;

revoke all on function public.get_population_stats(integer) from public;
grant execute on function public.get_population_stats(integer) to authenticated;
