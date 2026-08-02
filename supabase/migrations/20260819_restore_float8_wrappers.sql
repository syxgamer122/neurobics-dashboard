-- 20260819: KHOI PHUC CAC BAN OVERLOAD float8 (DANG WRAPPER)
--
-- BOI CANH: migration 20260817 da drop cac ban float8 cua decay_rating,
-- decayed_cognitive_index, apply_round_rating va idle_days_vn(text) vi chung
-- la code cu co CONG THUC KHAC, va Postgres lai uu tien chon chung.
--
-- HAU QUA NGOAI Y MUON: cot public.profiles.cfop_spatial_record trong DB that
-- co kieu "double precision" (khong phai integer nhu cac migration sau nay gia
-- dinh). Postgres KHONG tu dong ep float8 -> numeric khi phan giai ham (cast
-- float8->numeric chi la "assignment", khong phai "implicit"). Vi vay sau khi
-- drop, moi loi goi deu bao:
--   function public.decay_rating(double precision, integer) does not exist
--   function public.decayed_cognitive_index(integer,...,double precision,date)
--     does not exist
-- => get_leaderboard, get_population_stats, get_friend_leaderboard tra ve 404.
--
-- CACH SUA: tao lai cac ban float8 nhung CHI LA VO BOC (wrapper) - ep kieu roi
-- goi thang ban numeric chuan. Nhu vay du Postgres chon ban nao thi ket qua
-- cung y het nhau, khong con nguy co chay nham cong thuc cu.

-- 1. decay_rating -------------------------------------------------------------
create or replace function public.decay_rating(
  p_value double precision,
  p_idle_days integer
)
returns integer
language sql
immutable
as $$
  select public.decay_rating(p_value::numeric, p_idle_days);
$$;

-- 2. apply_round_rating -------------------------------------------------------
create or replace function public.apply_round_rating(
  p_current double precision,
  p_round integer
)
returns integer
language sql
immutable
as $$
  select public.apply_round_rating(
    greatest(0, least(1000, round(coalesce(p_current, 0))::integer)),
    p_round
  );
$$;

-- 3. decayed_cognitive_index --------------------------------------------------
create or replace function public.decayed_cognitive_index(
  p_logic double precision,
  p_memory double precision,
  p_speed double precision,
  p_focus double precision,
  p_spatial double precision,
  p_last_active date
)
returns double precision
language sql
stable
as $$
  select public.decayed_cognitive_index(
    p_logic::numeric,
    p_memory::numeric,
    p_speed::numeric,
    p_focus::numeric,
    p_spatial::numeric,
    p_last_active
  );
$$;

-- 4. idle_days_vn(text) -------------------------------------------------------
create or replace function public.idle_days_vn(p_last_active text)
returns integer
language sql
stable
as $$
  select public.idle_days_vn(nullif(p_last_active, '')::date);
$$;

-- Quyen: giong het cac ban numeric.
revoke all on function public.decay_rating(double precision, integer) from public, anon, authenticated;
revoke all on function public.apply_round_rating(double precision, integer) from public, anon, authenticated;
revoke all on function public.idle_days_vn(text) from public, anon, authenticated;
grant execute on function public.decay_rating(double precision, integer) to service_role;
grant execute on function public.apply_round_rating(double precision, integer) to service_role;
grant execute on function public.idle_days_vn(text) to service_role;
grant execute on function public.decayed_cognitive_index(double precision, double precision, double precision, double precision, double precision, date) to authenticated, service_role;

-- Kiem chung: wrapper phai cho ket qua y het ban numeric.
do $$
begin
  if public.decay_rating(500.0::double precision, 0) is distinct from public.decay_rating(500::numeric, 0) then
    raise exception 'decay_rating wrapper lech ket qua';
  end if;
  if public.apply_round_rating(0::double precision, 300) is distinct from 300 then
    raise exception 'apply_round_rating wrapper sai: cold start phai = 300';
  end if;
  if public.apply_round_rating(500::double precision, 600) is distinct from 540 then
    raise exception 'apply_round_rating wrapper sai: EMA phai = 540';
  end if;
  raise notice 'OK: da khoi phuc wrapper float8, cac RPC bang xep hang chay lai duoc';
end $$;
