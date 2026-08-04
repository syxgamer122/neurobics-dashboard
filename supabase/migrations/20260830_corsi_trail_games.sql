-- ════════════════════════════════════════════════════════════════════════════
-- 20260830_corsi_trail_games.sql
-- Hai game mới:
--   • Corsi Block  — Memory (chính) + Spatial (phụ)
--   • Trail Making — Speed  (chính) + Focus   (phụ)
-- Lấp hai trục mỏng nhất của hệ: spatial (1 chính) và speed (1 chính).
--
-- Nguyên tắc: KHÔNG bao giờ nới lỏng check constraint cho dễ deploy — mọi
-- danh sách game đều được liệt kê tường minh đủ 11 trò.
-- ════════════════════════════════════════════════════════════════════════════

set local search_path = public;

-- 1) Cột đếm ván
alter table public.profiles
  add column if not exists corsi_sessions integer not null default 0;
alter table public.profiles
  add column if not exists trail_sessions integer not null default 0;

-- Người dùng không được tự sửa số ván — chỉ RPC security definer mới tăng.
revoke update (corsi_sessions, trail_sessions) on public.profiles
  from authenticated, anon;

-- 2) Nới ràng buộc game (liệt kê đủ 11 trò)
alter table public.round_tickets drop constraint if exists round_tickets_game_check;
alter table public.round_tickets
  add constraint round_tickets_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo','mental','corsi','trail'));

alter table public.training_sessions drop constraint if exists training_sessions_game_check;
alter table public.training_sessions
  add constraint training_sessions_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo','mental','corsi','trail'));

alter table public.xp_events drop constraint if exists xp_events_game_check;
alter table public.xp_events
  add constraint xp_events_game_check
  check (game in ('schulte','sudoku','stroop','memory','reaction','nback','math','gonogo','mental','corsi','trail','quest','achievement'));

-- 3) submit_round_transaction: nhận 'corsi'/'trail' + tăng hai cột mới
-- (giữ nguyên toàn bộ logic decay baseline 5 trục, rate limit, trần XP)
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
  if p_game not in ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo','mental','corsi','trail') then
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
    mental_sessions   = mental_sessions   + case when p_game='mental'   then 1 else 0 end,
    corsi_sessions    = corsi_sessions    + case when p_game='corsi'    then 1 else 0 end,
    trail_sessions    = trail_sessions    + case when p_game='trail'    then 1 else 0 end,
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

-- 4) get_population_stats: cộng hai cột mới vào ngưỡng hiệu chuẩn
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
        + coalesce(mental_sessions, 0)
        + coalesce(corsi_sessions, 0)
        + coalesce(trail_sessions, 0)
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

-- 5) Nhiệm vụ: thêm q_play_corsi_2 / q_play_trail_2 vào vòng xoay hàng ngày
create or replace function public.quest_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    when 'q_rounds_3'        then 25
    when 'q_rounds_5'        then 35
    when 'q_rounds_7'        then 45
    when 'q_score_600'       then 30
    when 'q_score_750_2'     then 45
    when 'q_score_850'       then 55
    when 'q_games_2'         then 30
    when 'q_games_3'         then 40
    when 'q_games_4'         then 55
    when 'q_play_schulte_2'  then 35
    when 'q_play_sudoku_2'   then 35
    when 'q_play_stroop_2'   then 35
    when 'q_play_reaction_2' then 35
    when 'q_play_memory_2'   then 35
    when 'q_play_nback_2'    then 35
    when 'q_play_math_2'     then 35
    when 'q_play_gonogo_2'   then 35
    when 'q_play_mental_2'   then 35
    when 'q_play_corsi_2'    then 35
    when 'q_play_trail_2'    then 35
    when 'w_rounds_25'       then 120
    when 'w_games_7'         then 160
    when 'w_score_800_5'     then 180
    when 'w_score_900_3'     then 220
    else 0
  end;
$$;

create or replace function public.quest_title(p_code text, p_lang text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_lang, 'vi'))
    when 'en' then
      case p_code
        when 'q_rounds_3'        then 'Warm up: play 3 rounds'
        when 'q_rounds_5'        then 'Play 5 rounds today'
        when 'q_rounds_7'        then 'Endurance: play 7 rounds'
        when 'q_score_600'       then 'Score 600+ in one round'
        when 'q_score_750_2'     then 'Score 750+ in 2 rounds'
        when 'q_score_850'       then 'Score 850+ in one round'
        when 'q_games_2'         then 'Play 2 different games'
        when 'q_games_3'         then 'Play 3 different games'
        when 'q_games_4'         then 'Play 4 different games'
        when 'q_play_schulte_2'  then 'Play 2 Schulte rounds'
        when 'q_play_sudoku_2'   then 'Play 2 Sudoku rounds'
        when 'q_play_stroop_2'   then 'Play 2 Stroop rounds'
        when 'q_play_reaction_2' then 'Play 2 Reaction rounds'
        when 'q_play_memory_2'   then 'Play 2 Memory rounds'
        when 'q_play_nback_2'    then 'Play 2 N-Back rounds'
        when 'q_play_math_2'     then 'Play 2 Math Sprint rounds'
        when 'q_play_gonogo_2'   then 'Play 2 Go / No-Go rounds'
        when 'q_play_mental_2'   then 'Play 2 Mental Rotation rounds'
        when 'q_play_corsi_2'    then 'Play 2 Corsi Block rounds'
        when 'q_play_trail_2'    then 'Play 2 Trail Making rounds'
        when 'w_rounds_25'       then 'Weekly: finish 25 rounds'
        when 'w_games_7'         then 'Weekly: play 7 different games'
        when 'w_score_800_5'     then 'Weekly: 5 rounds at 800+'
        when 'w_score_900_3'     then 'Elite week: 3 rounds at 900+'
        else initcap(replace(regexp_replace(p_code, '^[qw]_', ''), '_', ' '))
      end
    else
      case p_code
        when 'q_rounds_3'        then 'Khởi động: chơi 3 ván'
        when 'q_rounds_5'        then 'Chơi 5 ván hôm nay'
        when 'q_rounds_7'        then 'Bền bỉ: chơi 7 ván'
        when 'q_score_600'       then 'Đạt 600+ trong một ván'
        when 'q_score_750_2'     then 'Đạt 750+ trong 2 ván'
        when 'q_score_850'       then 'Đạt 850+ trong một ván'
        when 'q_games_2'         then 'Chơi 2 trò khác nhau'
        when 'q_games_3'         then 'Chơi 3 trò khác nhau'
        when 'q_games_4'         then 'Chơi 4 trò khác nhau'
        when 'q_play_schulte_2'  then 'Chơi Schulte 2 ván'
        when 'q_play_sudoku_2'   then 'Chơi Sudoku 2 ván'
        when 'q_play_stroop_2'   then 'Chơi Stroop 2 ván'
        when 'q_play_reaction_2' then 'Chơi Reaction 2 ván'
        when 'q_play_memory_2'   then 'Chơi Memory 2 ván'
        when 'q_play_nback_2'    then 'Chơi N-Back 2 ván'
        when 'q_play_math_2'     then 'Chơi Math Sprint 2 ván'
        when 'q_play_gonogo_2'   then 'Chơi Go / No-Go 2 ván'
        when 'q_play_mental_2'   then 'Chơi Mental Rotation 2 ván'
        when 'q_play_corsi_2'    then 'Chơi Corsi Block 2 ván'
        when 'q_play_trail_2'    then 'Chơi Trail Making 2 ván'
        when 'w_rounds_25'       then 'Tuần: hoàn thành 25 ván'
        when 'w_games_7'         then 'Tuần: chơi 7 trò khác nhau'
        when 'w_score_800_5'     then 'Tuần: 5 ván đạt 800+'
        when 'w_score_900_3'     then 'Tuần elite: 3 ván đạt 900+'
        else initcap(replace(regexp_replace(p_code, '^[qw]_', ''), '_', ' '))
      end
  end;
$$;

revoke all on function public.quest_title(text, text) from public, anon;
grant execute on function public.quest_title(text, text) to authenticated;

-- get_daily_quests: vòng xoay per-game từ 9 → 11 trò.
-- Kiểu trả về KHÔNG đổi so với 20260828 nên có thể create or replace.
create or replace function public.get_daily_quests()
returns table (
  code text,
  progress integer,
  goal integer,
  xp_reward integer,
  claimed boolean,
  title_vi text,
  title_en text
)
language sql
stable
security definer
set search_path = public
as $$
  with clock as (
    select
      (now() at time zone 'Asia/Ho_Chi_Minh')::date as today,
      date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh')::date as week_start
  ),
  seed as (
    select (today - date '2020-01-01')::integer as n from clock
  ),
  daily as (
    select s.*
    from public.training_sessions s, clock c
    where s.user_id = auth.uid()
      and (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date = c.today
  ),
  weekly as (
    select s.*
    from public.training_sessions s, clock c
    where s.user_id = auth.uid()
      and (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= c.week_start
      and (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date < c.week_start + 7
  ),
  daily_agg as (
    select
      (select count(*) from daily)::integer as rounds,
      (select count(*) from daily where round_score >= 600)::integer as score_600,
      (select count(*) from daily where round_score >= 750)::integer as score_750,
      (select count(*) from daily where round_score >= 850)::integer as score_850,
      (select count(distinct game) from daily)::integer as games
  ),
  weekly_agg as (
    select
      (select count(*) from weekly)::integer as rounds,
      (select count(distinct game) from weekly)::integer as games,
      (select count(*) from weekly where round_score >= 800)::integer as score_800,
      (select count(*) from weekly where round_score >= 900)::integer as score_900
  ),
  daily_volume(code, raw_progress, goal) as (
    select
      case mod(seed.n, 3)
        when 0 then 'q_rounds_3'
        when 1 then 'q_rounds_5'
        else 'q_rounds_7'
      end,
      daily_agg.rounds,
      case mod(seed.n, 3) when 0 then 3 when 1 then 5 else 7 end
    from seed cross join daily_agg
  ),
  daily_quality(code, raw_progress, goal) as (
    select
      case mod(seed.n + 1, 3)
        when 0 then 'q_score_600'
        when 1 then 'q_score_750_2'
        else 'q_score_850'
      end,
      case mod(seed.n + 1, 3)
        when 0 then daily_agg.score_600
        when 1 then daily_agg.score_750
        else daily_agg.score_850
      end,
      case mod(seed.n + 1, 3) when 1 then 2 else 1 end
    from seed cross join daily_agg
  ),
  daily_variety(code, raw_progress, goal) as (
    select
      case
        when mod(seed.n, 2) = 0 then
          case mod(seed.n, 3)
            when 0 then 'q_games_2'
            when 1 then 'q_games_3'
            else 'q_games_4'
          end
        else (array[
          'q_play_schulte_2','q_play_sudoku_2','q_play_stroop_2',
          'q_play_reaction_2','q_play_memory_2','q_play_nback_2',
          'q_play_math_2','q_play_gonogo_2','q_play_mental_2',
          'q_play_corsi_2','q_play_trail_2'
        ])[mod(seed.n, 11) + 1]
      end,
      case
        when mod(seed.n, 2) = 0 then daily_agg.games
        else (
          select count(*)::integer
          from daily d
          where d.game = (array[
            'schulte','sudoku','stroop','reaction','memory',
            'nback','math','gonogo','mental','corsi','trail'
          ])[mod(seed.n, 11) + 1]
        )
      end,
      case
        when mod(seed.n, 2) = 0 then
          case mod(seed.n, 3) when 0 then 2 when 1 then 3 else 4 end
        else 2
      end
    from seed cross join daily_agg
  ),
  weekly_choice as (
    select mod(((clock.week_start - date '2020-01-06') / 7), 2) as variant
    from clock
  ),
  weekly_defs(code, raw_progress, goal) as (
    select 'w_rounds_25', weekly_agg.rounds, 25 from weekly_agg
    union all
    select 'w_games_7', weekly_agg.games, 7 from weekly_agg
    union all
    select
      case when weekly_choice.variant = 0 then 'w_score_800_5' else 'w_score_900_3' end,
      case when weekly_choice.variant = 0 then weekly_agg.score_800 else weekly_agg.score_900 end,
      case when weekly_choice.variant = 0 then 5 else 3 end
    from weekly_agg cross join weekly_choice
  ),
  defs(code, raw_progress, goal, period_key, sort_order) as (
    select code, raw_progress, goal, clock.today, 1 from daily_volume cross join clock
    union all
    select code, raw_progress, goal, clock.today, 2 from daily_quality cross join clock
    union all
    select code, raw_progress, goal, clock.today, 3 from daily_variety cross join clock
    union all
    select code, raw_progress, goal, clock.week_start, 10 from weekly_defs cross join clock
  )
  select
    d.code::text,
    least(greatest(d.raw_progress, 0), d.goal)::integer,
    d.goal::integer,
    public.quest_xp(d.code)::integer,
    exists (
      select 1
      from public.quest_claims c
      where c.user_id = auth.uid()
        and c.code = d.code
        and c.quest_day = d.period_key
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  from defs d
  order by d.sort_order, d.code;
$$;

revoke all on function public.get_daily_quests() from public, anon;
grant execute on function public.get_daily_quests() to authenticated;

-- 6) Tự kiểm tra: migration phải tự báo lỗi thay vì âm thầm sai
do $$
declare
  v_cols integer;
  v_ticket_ok boolean;
  v_session_ok boolean;
  v_xp_ok boolean;
  v_quest_xp integer;
  v_title text;
begin
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in ('corsi_sessions', 'trail_sessions');
  if v_cols <> 2 then
    raise exception 'Thieu cot dem van: mong doi 2, thay %', v_cols;
  end if;

  select pg_get_constraintdef(oid) like '%corsi%' and pg_get_constraintdef(oid) like '%trail%'
    into v_ticket_ok
  from pg_constraint where conname = 'round_tickets_game_check';
  select pg_get_constraintdef(oid) like '%corsi%' and pg_get_constraintdef(oid) like '%trail%'
    into v_session_ok
  from pg_constraint where conname = 'training_sessions_game_check';
  select pg_get_constraintdef(oid) like '%corsi%' and pg_get_constraintdef(oid) like '%trail%'
    into v_xp_ok
  from pg_constraint where conname = 'xp_events_game_check';

  if not coalesce(v_ticket_ok, false) then
    raise exception 'round_tickets_game_check chua nhan corsi/trail';
  end if;
  if not coalesce(v_session_ok, false) then
    raise exception 'training_sessions_game_check chua nhan corsi/trail';
  end if;
  if not coalesce(v_xp_ok, false) then
    raise exception 'xp_events_game_check chua nhan corsi/trail';
  end if;

  select public.quest_xp('q_play_corsi_2') into v_quest_xp;
  if coalesce(v_quest_xp, 0) <> 35 then
    raise exception 'quest_xp(q_play_corsi_2) sai: %', v_quest_xp;
  end if;

  select public.quest_title('q_play_trail_2', 'vi') into v_title;
  if v_title is null or v_title like 'Play%' or v_title = 'Play Trail 2' then
    raise exception 'quest_title(q_play_trail_2) chua co ban dich: %', v_title;
  end if;

  raise notice 'OK: corsi/trail da vao du 3 rang buoc, 2 cot dem van, quest_xp va quest_title';
end;
$$;
