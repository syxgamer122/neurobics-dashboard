-- 20260826_quest_depth.sql
-- 3 daily quests rotate every day + 3 weekly quests. Server-authoritative.
-- The RPC name get_daily_quests is retained for backward compatibility.

set local search_path = public;

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
    when 'w_rounds_25'       then 120
    when 'w_games_7'         then 160
    when 'w_score_800_5'     then 180
    when 'w_score_900_3'     then 220
    else 0
  end;
$$;

create or replace function public.get_daily_quests()
returns table (
  code text,
  progress integer,
  goal integer,
  xp_reward integer,
  claimed boolean
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
          'q_play_math_2','q_play_gonogo_2','q_play_mental_2'
        ])[mod(seed.n, 9) + 1]
      end,
      case
        when mod(seed.n, 2) = 0 then daily_agg.games
        else (
          select count(*)::integer
          from daily d
          where d.game = (array[
            'schulte','sudoku','stroop','reaction','memory',
            'nback','math','gonogo','mental'
          ])[mod(seed.n, 9) + 1]
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
    )
  from defs d
  order by d.sort_order, d.code;
$$;

revoke all on function public.get_daily_quests() from public, anon;
grant execute on function public.get_daily_quests() to authenticated;

create or replace function public.claim_quest(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_week date := date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_period date;
  v_row record;
  v_xp integer;
  v_total bigint;
  v_inserted text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  v_period := case when left(p_code, 2) = 'w_' then v_week else v_today end;
  perform pg_advisory_xact_lock(hashtext(v_user::text || ':quest'));

  select * into v_row
  from public.get_daily_quests() q
  where q.code = p_code;

  if not found then raise exception 'Unknown or inactive quest'; end if;
  if v_row.claimed then raise exception 'Quest already claimed'; end if;
  if v_row.progress < v_row.goal then raise exception 'Quest not completed'; end if;

  v_xp := public.quest_xp(p_code);
  if v_xp <= 0 then raise exception 'Quest reward is not configured'; end if;

  insert into public.quest_claims(user_id, quest_day, code, xp_awarded)
  values (v_user, v_period, p_code, v_xp)
  on conflict do nothing
  returning code into v_inserted;

  if v_inserted is null then raise exception 'Quest already claimed'; end if;

  insert into public.xp_events(user_id, game, round_score, xp_awarded)
  values (v_user, 'quest', 0, v_xp);

  update public.profiles
  set total_xp = coalesce(total_xp, 0) + v_xp
  where id = v_user
  returning total_xp into v_total;

  if v_total is null then raise exception 'Profile not found'; end if;

  return jsonb_build_object(
    'code', p_code,
    'xpAwarded', v_xp,
    'totalXp', v_total
  );
end;
$$;

revoke all on function public.claim_quest(text) from public, anon;
grant execute on function public.claim_quest(text) to authenticated;
