-- 20260828_quest_titles.sql
-- Trả nhãn tiếng Việt / English cùng get_daily_quests để client không còn
-- phụ thuộc bản dịch cục bộ khi hiện tên nhiệm vụ (w_games_7, w_rounds_25…).
-- Đổi kiểu trả về → phải DROP rồi CREATE lại function.

set local search_path = public;

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

-- Đổi OUT columns → drop trước khi tạo lại.
drop function if exists public.get_daily_quests();

create function public.get_daily_quests()
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
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  from defs d
  order by d.sort_order, d.code;
$$;

revoke all on function public.get_daily_quests() from public, anon;
grant execute on function public.get_daily_quests() to authenticated;
