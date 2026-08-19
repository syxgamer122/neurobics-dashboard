-- 20260814_fix_sync_achievements_array.sql
-- ---------------------------------------------------------------------------
-- LOI: sync_achievements() bao 'malformed array literal: "first_round"'
--
-- Nguyen nhan: v_new duoc khai bao text[], con 'first_round' la hang chua ro
-- kieu (unknown). Khi gap  v_new || 'first_round'  Postgres uu tien chon
-- toan tu  anyarray || anyarray , nen no co ep 'first_round' thanh text[].
-- Chuoi do khong phai array literal hop le => loi ngay tu lan dong bo dau
-- tien, tuc la KHONG AI mo khoa duoc thanh tuu nao.
--
-- Cach sua: ep kieu tuong minh ::text de Postgres chon  anyarray || anyelement .
-- Dung array_append() cung duoc, o day giu nguyen cu phap || cho de doc.

set local search_path = public;

create or replace function public.sync_achievements()
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_rounds bigint;
  v_distinct_games bigint;
  v_best integer;
  v_max_axis integer;
  v_level integer;
  v_has_extreme boolean;
  v_nback_best integer;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_p from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;

  select count(*), count(distinct s.game), coalesce(max(s.round_score),0)
    into v_rounds, v_distinct_games, v_best
  from public.training_sessions s where s.user_id = v_user;

  select coalesce(max(s.round_score),0) into v_nback_best
  from public.training_sessions s where s.user_id = v_user and s.game = 'nback';

  select exists(
    select 1 from public.training_sessions s
    where s.user_id = v_user and s.game = 'sudoku' and s.label = 'Extreme'
  ) into v_has_extreme;

  v_max_axis := greatest(
    coalesce(v_p.speed_score,0), coalesce(v_p.focus_score,0),
    coalesce(v_p.memory_score,0), coalesce(v_p.algebraic_logic_score,0),
    coalesce(v_p.cfop_spatial_record,0)
  );
  v_level := floor((-1 + sqrt(1 + coalesce(v_p.total_xp,0)/12.5))/2)::integer + 1;

  -- Danh sach ma dat dieu kien. Moi hang PHAI co ::text (xem ghi chu dau file).
  if v_rounds >= 1   then v_new := v_new || 'first_round'::text; end if;
  if v_rounds >= 10  then v_new := v_new || 'rounds_10'::text;   end if;
  if v_rounds >= 50  then v_new := v_new || 'rounds_50'::text;   end if;
  if v_rounds >= 100 then v_new := v_new || 'rounds_100'::text;  end if;
  if coalesce(v_p.synapse_streak,0) >= 3  then v_new := v_new || 'streak_3'::text;  end if;
  if coalesce(v_p.synapse_streak,0) >= 7  then v_new := v_new || 'streak_7'::text;  end if;
  if coalesce(v_p.synapse_streak,0) >= 30 then v_new := v_new || 'streak_30'::text; end if;
  if v_level >= 5  then v_new := v_new || 'level_5'::text;  end if;
  if v_level >= 10 then v_new := v_new || 'level_10'::text; end if;
  if v_level >= 20 then v_new := v_new || 'level_20'::text; end if;
  if v_max_axis >= 500 then v_new := v_new || 'axis_500'::text; end if;
  if v_max_axis >= 800 then v_new := v_new || 'axis_800'::text; end if;
  if v_distinct_games >= 6 then v_new := v_new || 'all_games'::text; end if;
  if v_best >= 900 then v_new := v_new || 'score_900'::text; end if;
  if v_has_extreme then v_new := v_new || 'sudoku_extreme'::text; end if;
  if v_nback_best >= 700 then v_new := v_new || 'nback_ace'::text; end if;

  -- Mo khoa nhung cai chua co + cong XP thuong mot lan duy nhat
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
        update public.profiles set total_xp = coalesce(total_xp,0) + v_xp where id = v_user;
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
