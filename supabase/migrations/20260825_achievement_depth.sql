-- ════════════════════════════════════════════════════════════════════════
-- 20260825_achievement_depth.sql
--
-- VẤN ĐỀ: 16 badge, phần lớn mở khoá quá sớm (100 ván / streak 30 / level 20
-- là trần), và 7/9 game không có badge riêng.
--
-- THIẾT KỬ MỚI: 55 badge chia 5 hạng (bronze → diamond), 7 nhóm:
--   volume · streak · level · mastery · breadth · score · game
-- Mỗi game đều có ít nhất 2 badge; thêm badge "khó thật" (all_axes_850,
-- rounds_1000, streak_100, score_990, nback_deep…) để có đường dài để đi.
--
-- Thêm get_achievement_progress(): trả progress/goal cho TỪ NG badge để UI vẽ
-- thanh tiến độ (trước đây chỉ biết đã mở hay chưa).
-- ════════════════════════════════════════════════════════════════════════

set local search_path = public;

-- ─── 1) Thống kê dùng chung cho sync + progress ───────────────────────────
-- Một nguồn sự thật duy nhất: hai hàm dưới không được tự tính lại kiểu khác nhau,
-- nếu không badge sẽ "đủ điều kiện" mà thanh tiến độ vẫn thiếu.
create or replace function public.achievement_stats(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select * from public.profiles where id = p_user
  ),
  s as (
    select * from public.training_sessions where user_id = p_user
  ),
  -- Ván THẮNG: Schulte/Sudoku thua được gắn hậu tố "(failed)" vào label.
  w as (
    select * from s where label is null or label not ilike '%(failed)%'
  ),
  per_game as (
    select game, count(*)::int as n, max(round_score)::int as best
    from s group by game
  )
  select jsonb_build_object(
    'rounds',   coalesce((select count(*) from s), 0),
    'games',    coalesce((select count(distinct game) from s), 0),
    'best',     coalesce((select max(round_score) from s), 0),
    'perfect',  coalesce((select count(*) from s where round_score >= 950), 0),
    'days',     coalesce((
                  select count(distinct (created_at at time zone 'Asia/Ho_Chi_Minh')::date)
                  from s
                ), 0),
    'streak',   coalesce((select synapse_streak from p), 0),
    'total_xp', coalesce((select total_xp from p), 0),
    'level',    coalesce((
                  select floor((-1 + sqrt(1 + coalesce(total_xp,0)/12.5))/2)::int + 1 from p
                ), 1),
    'max_axis', coalesce((
                  select greatest(
                    coalesce(speed_score,0), coalesce(focus_score,0),
                    coalesce(memory_score,0), coalesce(algebraic_logic_score,0),
                    coalesce(cfop_spatial_record,0)
                  ) from p
                ), 0),
    'min_axis', coalesce((
                  select least(
                    coalesce(speed_score,0), coalesce(focus_score,0),
                    coalesce(memory_score,0), coalesce(algebraic_logic_score,0),
                    coalesce(cfop_spatial_record,0)
                  ) from p
                ), 0),
    -- Đủ chiều rộng: bao nhiêu game đã chơi ≥ 10 ván / đạt ≥ 600 điểm.
    'games_10',  coalesce((select count(*) from per_game where n >= 10), 0),
    'games_600', coalesce((select count(*) from per_game where best >= 600), 0),
    -- Best từng game
    'b_schulte',  coalesce((select best from per_game where game = 'schulte'), 0),
    'b_sudoku',   coalesce((select best from per_game where game = 'sudoku'), 0),
    'b_stroop',   coalesce((select best from per_game where game = 'stroop'), 0),
    'b_reaction', coalesce((select best from per_game where game = 'reaction'), 0),
    'b_memory',   coalesce((select best from per_game where game = 'memory'), 0),
    'b_nback',    coalesce((select best from per_game where game = 'nback'), 0),
    'b_math',     coalesce((select best from per_game where game = 'math'), 0),
    'b_gonogo',   coalesce((select best from per_game where game = 'gonogo'), 0),
    'b_mental',   coalesce((select best from per_game where game = 'mental'), 0),
    -- Mốc đặc biệt (chỉ tính ván thắng)
    -- Schulte label: '6×6 Classic' → lấy số đầu chuỗi, không phụ thuộc ký tự ×.
    'schulte_6x6', (select exists(
        select 1 from w
        where game = 'schulte'
          and coalesce(nullif(substring(label from '^([0-9]+)'), '')::int, 0) >= 6
      )),
    'sudoku_extreme', (select exists(
        select 1 from w where game = 'sudoku' and label ilike 'Extreme%'
      )),
    -- N-Back label: '5-Back' trở lên mới tính là "sâu".
    'nback_deep', (select exists(
        select 1 from w
        where game = 'nback'
          and coalesce(nullif(substring(label from '^([0-9]+)'), '')::int, 0) >= 5
      ))
  );
$$;

revoke all on function public.achievement_stats(uuid) from public, anon;
grant execute on function public.achievement_stats(uuid) to authenticated, service_role;

-- ─── 2) XP thưởng theo hạng ──────────────────────────────────────────
create or replace function public.achievement_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    -- volume
    when 'first_round'    then 20
    when 'rounds_10'      then 30
    when 'rounds_50'      then 60
    when 'rounds_100'     then 100
    when 'rounds_250'     then 160
    when 'rounds_500'     then 250
    when 'rounds_1000'    then 400
    -- streak
    when 'streak_3'       then 30
    when 'streak_7'       then 60
    when 'streak_14'      then 90
    when 'streak_30'      then 150
    when 'streak_60'      then 250
    when 'streak_100'     then 400
    when 'days_60'        then 180
    -- level / xp
    when 'level_5'        then 40
    when 'level_10'       then 70
    when 'level_20'       then 120
    when 'level_30'       then 200
    when 'level_50'       then 350
    when 'xp_10000'       then 220
    -- mastery
    when 'axis_500'       then 50
    when 'axis_800'       then 120
    when 'axis_900'       then 200
    when 'axis_950'       then 320
    when 'all_axes_500'   then 150
    when 'all_axes_700'   then 260
    when 'all_axes_850'   then 420
    -- breadth
    when 'all_games'      then 80
    when 'all_games_10'   then 180
    when 'all_games_600'  then 280
    -- score
    when 'score_900'      then 90
    when 'score_950'      then 150
    when 'score_990'      then 300
    when 'perfect_10'     then 220
    -- per game
    when 'schulte_700'    then 60
    when 'schulte_900'    then 130
    when 'schulte_6x6'    then 120
    when 'sudoku_700'     then 60
    when 'sudoku_900'     then 130
    when 'sudoku_extreme' then 120
    when 'stroop_700'     then 60
    when 'stroop_900'     then 130
    when 'reaction_700'   then 60
    when 'reaction_900'   then 130
    when 'memory_700'     then 60
    when 'memory_900'     then 130
    when 'nback_ace'      then 90
    when 'nback_900'      then 150
    when 'nback_deep'     then 200
    when 'math_700'       then 60
    when 'math_900'       then 130
    when 'gonogo_700'     then 60
    when 'gonogo_900'     then 130
    when 'mental_700'     then 60
    when 'mental_900'     then 130
    else 0
  end;
$$;

-- ─── 3) Xét lại toàn bộ và mở khoá ───────────────────────────────────
create or replace function public.sync_achievements()
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v jsonb;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
  n_rounds bigint;
  n_streak integer;
  n_level integer;
  n_days bigint;
  n_maxax integer;
  n_minax integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Profile not found';
  end if;

  v := public.achievement_stats(v_user);

  n_rounds := (v->>'rounds')::bigint;
  n_streak := (v->>'streak')::int;
  n_level  := (v->>'level')::int;
  n_days   := (v->>'days')::bigint;
  n_maxax  := (v->>'max_axis')::int;
  n_minax  := (v->>'min_axis')::int;

  -- volume
  if n_rounds >= 1    then v_new := v_new || 'first_round'::text; end if;
  if n_rounds >= 10   then v_new := v_new || 'rounds_10'::text;   end if;
  if n_rounds >= 50   then v_new := v_new || 'rounds_50'::text;   end if;
  if n_rounds >= 100  then v_new := v_new || 'rounds_100'::text;  end if;
  if n_rounds >= 250  then v_new := v_new || 'rounds_250'::text;  end if;
  if n_rounds >= 500  then v_new := v_new || 'rounds_500'::text;  end if;
  if n_rounds >= 1000 then v_new := v_new || 'rounds_1000'::text; end if;

  -- streak
  if n_streak >= 3   then v_new := v_new || 'streak_3'::text;   end if;
  if n_streak >= 7   then v_new := v_new || 'streak_7'::text;   end if;
  if n_streak >= 14  then v_new := v_new || 'streak_14'::text;  end if;
  if n_streak >= 30  then v_new := v_new || 'streak_30'::text;  end if;
  if n_streak >= 60  then v_new := v_new || 'streak_60'::text;  end if;
  if n_streak >= 100 then v_new := v_new || 'streak_100'::text; end if;
  if n_days   >= 60  then v_new := v_new || 'days_60'::text;    end if;

  -- level / xp
  if n_level >= 5  then v_new := v_new || 'level_5'::text;  end if;
  if n_level >= 10 then v_new := v_new || 'level_10'::text; end if;
  if n_level >= 20 then v_new := v_new || 'level_20'::text; end if;
  if n_level >= 30 then v_new := v_new || 'level_30'::text; end if;
  if n_level >= 50 then v_new := v_new || 'level_50'::text; end if;
  if (v->>'total_xp')::bigint >= 10000 then v_new := v_new || 'xp_10000'::text; end if;

  -- mastery
  if n_maxax >= 500 then v_new := v_new || 'axis_500'::text; end if;
  if n_maxax >= 800 then v_new := v_new || 'axis_800'::text; end if;
  if n_maxax >= 900 then v_new := v_new || 'axis_900'::text; end if;
  if n_maxax >= 950 then v_new := v_new || 'axis_950'::text; end if;
  if n_minax >= 500 then v_new := v_new || 'all_axes_500'::text; end if;
  if n_minax >= 700 then v_new := v_new || 'all_axes_700'::text; end if;
  if n_minax >= 850 then v_new := v_new || 'all_axes_850'::text; end if;

  -- breadth (9 game)
  if (v->>'games')::int     >= 9 then v_new := v_new || 'all_games'::text;     end if;
  if (v->>'games_10')::int  >= 9 then v_new := v_new || 'all_games_10'::text;  end if;
  if (v->>'games_600')::int >= 9 then v_new := v_new || 'all_games_600'::text; end if;

  -- score
  if (v->>'best')::int >= 900 then v_new := v_new || 'score_900'::text; end if;
  if (v->>'best')::int >= 950 then v_new := v_new || 'score_950'::text; end if;
  if (v->>'best')::int >= 990 then v_new := v_new || 'score_990'::text; end if;
  if (v->>'perfect')::int >= 10 then v_new := v_new || 'perfect_10'::text; end if;

  -- per game
  if (v->>'b_schulte')::int  >= 700 then v_new := v_new || 'schulte_700'::text;  end if;
  if (v->>'b_schulte')::int  >= 900 then v_new := v_new || 'schulte_900'::text;  end if;
  if (v->>'b_sudoku')::int   >= 700 then v_new := v_new || 'sudoku_700'::text;   end if;
  if (v->>'b_sudoku')::int   >= 900 then v_new := v_new || 'sudoku_900'::text;   end if;
  if (v->>'b_stroop')::int   >= 700 then v_new := v_new || 'stroop_700'::text;   end if;
  if (v->>'b_stroop')::int   >= 900 then v_new := v_new || 'stroop_900'::text;   end if;
  if (v->>'b_reaction')::int >= 700 then v_new := v_new || 'reaction_700'::text; end if;
  if (v->>'b_reaction')::int >= 900 then v_new := v_new || 'reaction_900'::text; end if;
  if (v->>'b_memory')::int   >= 700 then v_new := v_new || 'memory_700'::text;   end if;
  if (v->>'b_memory')::int   >= 900 then v_new := v_new || 'memory_900'::text;   end if;
  if (v->>'b_nback')::int    >= 700 then v_new := v_new || 'nback_ace'::text;    end if;
  if (v->>'b_nback')::int    >= 900 then v_new := v_new || 'nback_900'::text;    end if;
  if (v->>'b_math')::int     >= 700 then v_new := v_new || 'math_700'::text;     end if;
  if (v->>'b_math')::int     >= 900 then v_new := v_new || 'math_900'::text;     end if;
  if (v->>'b_gonogo')::int   >= 700 then v_new := v_new || 'gonogo_700'::text;   end if;
  if (v->>'b_gonogo')::int   >= 900 then v_new := v_new || 'gonogo_900'::text;   end if;
  if (v->>'b_mental')::int   >= 700 then v_new := v_new || 'mental_700'::text;   end if;
  if (v->>'b_mental')::int   >= 900 then v_new := v_new || 'mental_900'::text;   end if;

  -- đặc biệt
  if (v->>'schulte_6x6')::boolean    then v_new := v_new || 'schulte_6x6'::text;    end if;
  if (v->>'sudoku_extreme')::boolean then v_new := v_new || 'sudoku_extreme'::text; end if;
  if (v->>'nback_deep')::boolean     then v_new := v_new || 'nback_deep'::text;     end if;

  -- Mở khoá cái chưa có + cộng XP một lần duy nhất
  foreach v_code in array v_new loop
    if not exists (
      select 1 from public.user_achievements a
      where a.user_id = v_user and a.code = v_code
    ) then
      insert into public.user_achievements(user_id, code) values (v_user, v_code);
      v_xp := public.achievement_xp(v_code);
      if v_xp > 0 then
        insert into public.xp_events(user_id, game, round_score, xp_awarded)
        values (v_user, 'achievement', 0, v_xp);
        update public.profiles set total_xp = coalesce(total_xp,0) + v_xp
        where id = v_user;
      end if;
    end if;
  end loop;

  return query
    select a.code, a.unlocked_at, (a.unlocked_at > now() - interval '10 seconds')
    from public.user_achievements a
    where a.user_id = v_user
    order by a.unlocked_at desc;
end;
$$;

revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- ─── 4) Tiến độ từng badge (cho thanh progress trên UI) ──────────────────
create or replace function public.get_achievement_progress()
returns table (
  code        text,
  progress    integer,
  goal        integer,
  unlocked    boolean,
  unlocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select public.achievement_stats(auth.uid()) as j
  ),
  defs(code, progress, goal) as (
    -- volume
    select 'first_round',  least((j->>'rounds')::int, 1),     1     from v
    union all select 'rounds_10',   least((j->>'rounds')::int, 10),   10   from v
    union all select 'rounds_50',   least((j->>'rounds')::int, 50),   50   from v
    union all select 'rounds_100',  least((j->>'rounds')::int, 100),  100  from v
    union all select 'rounds_250',  least((j->>'rounds')::int, 250),  250  from v
    union all select 'rounds_500',  least((j->>'rounds')::int, 500),  500  from v
    union all select 'rounds_1000', least((j->>'rounds')::int, 1000), 1000 from v
    -- streak
    union all select 'streak_3',   least((j->>'streak')::int, 3),   3   from v
    union all select 'streak_7',   least((j->>'streak')::int, 7),   7   from v
    union all select 'streak_14',  least((j->>'streak')::int, 14),  14  from v
    union all select 'streak_30',  least((j->>'streak')::int, 30),  30  from v
    union all select 'streak_60',  least((j->>'streak')::int, 60),  60  from v
    union all select 'streak_100', least((j->>'streak')::int, 100), 100 from v
    union all select 'days_60',    least((j->>'days')::int, 60),    60  from v
    -- level / xp
    union all select 'level_5',   least((j->>'level')::int, 5),        5     from v
    union all select 'level_10',  least((j->>'level')::int, 10),       10    from v
    union all select 'level_20',  least((j->>'level')::int, 20),       20    from v
    union all select 'level_30',  least((j->>'level')::int, 30),       30    from v
    union all select 'level_50',  least((j->>'level')::int, 50),       50    from v
    union all select 'xp_10000',  least((j->>'total_xp')::int, 10000), 10000 from v
    -- mastery
    union all select 'axis_500',     least((j->>'max_axis')::int, 500), 500 from v
    union all select 'axis_800',     least((j->>'max_axis')::int, 800), 800 from v
    union all select 'axis_900',     least((j->>'max_axis')::int, 900), 900 from v
    union all select 'axis_950',     least((j->>'max_axis')::int, 950), 950 from v
    union all select 'all_axes_500', least((j->>'min_axis')::int, 500), 500 from v
    union all select 'all_axes_700', least((j->>'min_axis')::int, 700), 700 from v
    union all select 'all_axes_850', least((j->>'min_axis')::int, 850), 850 from v
    -- breadth
    union all select 'all_games',     least((j->>'games')::int, 9),     9 from v
    union all select 'all_games_10',  least((j->>'games_10')::int, 9),  9 from v
    union all select 'all_games_600', least((j->>'games_600')::int, 9), 9 from v
    -- score
    union all select 'score_900',  least((j->>'best')::int, 900),  900 from v
    union all select 'score_950',  least((j->>'best')::int, 950),  950 from v
    union all select 'score_990',  least((j->>'best')::int, 990),  990 from v
    union all select 'perfect_10', least((j->>'perfect')::int, 10), 10 from v
    -- per game
    union all select 'schulte_700',  least((j->>'b_schulte')::int, 700),  700 from v
    union all select 'schulte_900',  least((j->>'b_schulte')::int, 900),  900 from v
    union all select 'sudoku_700',   least((j->>'b_sudoku')::int, 700),   700 from v
    union all select 'sudoku_900',   least((j->>'b_sudoku')::int, 900),   900 from v
    union all select 'stroop_700',   least((j->>'b_stroop')::int, 700),   700 from v
    union all select 'stroop_900',   least((j->>'b_stroop')::int, 900),   900 from v
    union all select 'reaction_700', least((j->>'b_reaction')::int, 700), 700 from v
    union all select 'reaction_900', least((j->>'b_reaction')::int, 900), 900 from v
    union all select 'memory_700',   least((j->>'b_memory')::int, 700),   700 from v
    union all select 'memory_900',   least((j->>'b_memory')::int, 900),   900 from v
    union all select 'nback_ace',    least((j->>'b_nback')::int, 700),    700 from v
    union all select 'nback_900',    least((j->>'b_nback')::int, 900),    900 from v
    union all select 'math_700',     least((j->>'b_math')::int, 700),     700 from v
    union all select 'math_900',     least((j->>'b_math')::int, 900),     900 from v
    union all select 'gonogo_700',   least((j->>'b_gonogo')::int, 700),   700 from v
    union all select 'gonogo_900',   least((j->>'b_gonogo')::int, 900),   900 from v
    union all select 'mental_700',   least((j->>'b_mental')::int, 700),   700 from v
    union all select 'mental_900',   least((j->>'b_mental')::int, 900),   900 from v
    -- đặc biệt (nhị phân)
    union all select 'schulte_6x6',    case when (j->>'schulte_6x6')::boolean    then 1 else 0 end, 1 from v
    union all select 'sudoku_extreme', case when (j->>'sudoku_extreme')::boolean then 1 else 0 end, 1 from v
    union all select 'nback_deep',     case when (j->>'nback_deep')::boolean     then 1 else 0 end, 1 from v
  )
  select
    d.code,
    greatest(0, d.progress)::integer,
    d.goal::integer,
    (a.code is not null) as unlocked,
    a.unlocked_at
  from defs d
  left join public.user_achievements a
    on a.user_id = auth.uid() and a.code = d.code;
$$;

revoke all on function public.get_achievement_progress() from public, anon;
grant execute on function public.get_achievement_progress() to authenticated;
