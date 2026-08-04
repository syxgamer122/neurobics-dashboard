-- 20260827_xp_award_cap_fix.sql
--
-- LOI GOC (nguyen nhan chung cua ca quest lan badge):
--   Bang public.xp_events van giu rang buoc tu 20260730_xp_system.sql:
--     constraint xp_events_award_check check (xp_awarded between 0 and 100)
--   Hoi do moi nguon XP chi la mot van choi (toi da 100 XP).
--
--   Nhung tu 20260825 va 20260826, phan thuong da vuot xa 100:
--     - quest tuan:   w_rounds_25 = 120, w_games_7 = 160,
--                     w_score_800_5 = 180, w_score_900_3 = 220
--     - badge:        level_20 = 120, level_30 = 200, level_50 = 350,
--                     streak_100 = 400, all_axes_850 = 420, ...
--
--   Hau qua thuc te:
--   1) claim_quest() chen xp_events voi 120..220 -> vi pham rang buoc
--      -> loi "new row for relation xp_events violates check constraint
--         xp_events_award_check" -> KHONG nhan duoc quest tuan.
--   2) sync_achievements() chay trong MOT transaction. Chi can mot badge
--      co thuong > 100 duoc mo khoa la ca ham bi rollback -> KHONG badge nao
--      duoc ghi nhan, ke ca badge nho nhu level_5 (40 XP).
--      Day chinh la ly do nguoi da level 7 van khong co badge level_5.
--
-- SUA:
--   1) Noi rang buoc len 0..1000 (du cho badge dat nhat la 420).
--   2) Chan XP badge lai truoc khi ghi, de mot gia tri cau hinh sai
--      khong bao gio lam hong toan bo qua trinh dong bo nua.
--   3) Tach logic dong bo ra sync_achievements_for(uuid) de co the
--      backfill cho tai khoan da len level tu truoc.
--   4) Backfill mot lan cho toan bo nguoi dung dang co.
--
-- Rang buoc SQL van la bien gioi an toan: khong noi vo han, chi noi du dung.

set local search_path = public;

-- 1) Noi tran XP moi dong xp_events
alter table public.xp_events drop constraint if exists xp_events_award_check;
alter table public.xp_events
  add constraint xp_events_award_check
  check (xp_awarded between 0 and 1000);

-- 2) Logic dong bo badge, tach theo user de co the backfill
create or replace function public.sync_achievements_for(p_user uuid)
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := p_user;
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

  -- dac biet
  if (v->>'schulte_6x6')::boolean    then v_new := v_new || 'schulte_6x6'::text;    end if;
  if (v->>'sudoku_extreme')::boolean then v_new := v_new || 'sudoku_extreme'::text; end if;
  if (v->>'nback_deep')::boolean     then v_new := v_new || 'nback_deep'::text;     end if;

  -- Mo khoa cai chua co + cong XP mot lan duy nhat.
  -- XP duoc chan lai trong [0, 1000]: mot gia tri cau hinh sai khong duoc phep
  -- lam rollback toan bo qua trinh dong bo nhu bug cu nua.
  foreach v_code in array v_new loop
    if not exists (
      select 1 from public.user_achievements a
      where a.user_id = v_user and a.code = v_code
    ) then
      insert into public.user_achievements(user_id, code) values (v_user, v_code);
      v_xp := least(greatest(coalesce(public.achievement_xp(v_code), 0), 0), 1000);
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

-- Ham nhan uuid tuy y: chi dung noi bo va cho backfill, khong mo cho client.
revoke all on function public.sync_achievements_for(uuid) from public, anon, authenticated;

-- 3) Ham cong khai giu nguyen ten va hanh vi
create or replace function public.sync_achievements()
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  return query select * from public.sync_achievements_for(v_user);
end;
$$;

revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- 4) Backfill mot lan cho moi tai khoan da ton tai.
-- Nguoi da len level 7 tu truoc se nhan duoc level_5 ngay, khong phai cho
-- den luc mo bang thanh tuu. Moi badge van chi duoc cong XP dung mot lan
-- nho kiem tra ton tai trong user_achievements.
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    begin
      perform public.sync_achievements_for(r.id);
    exception when others then
      raise notice 'Backfill achievements skipped for %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;
