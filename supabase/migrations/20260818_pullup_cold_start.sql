-- 20260818_pullup_cold_start.sql
--
-- Sua thien lech COLD START cua apply_round_rating().
--
-- VAN DE (phat hien bang gia lap, khong phai suy dien):
--   apply_round_rating(0, 300) = 120
--
-- Cong thuc EMA upward-only lay 40% khoang cach den gia tri hien tai. Khi truc
-- CHUA CO baseline (p_current = 0 vi truc moi, hoac vi sanitize doc gia tri
-- legacy kieu tich luy ve 0), "khoang cach" duoc do tu 0 nen van dau tien chi
-- duoc ghi 40% so diem that:
--
--   van 1: 0   -> 120   (that su dat 300)
--   van 2: 120 -> 192
--   van 3: 192 -> 235
--   van 4: 235 -> 261   ... phai gan 10 van moi tiem can 300
--
-- Nguoi choi moi thay diem thap vo ly o van dau, va vi cognitive_index tinh
-- trung binh cac truc da mo, ca brain-age lan xep hang deu bi keo lech trong
-- suot giai doan dau. Truong hop nang hon: ho so legacy (gia tri > 1050 bi doc
-- ve 0) sau khi "hoi sinh" cung chi duoc 40% cua van dau tien.
--
-- EMA can mot gia tri TRUOC de lam muot. Khi khong co gia tri truoc thi khong
-- co gi de lam muot: van dau tien CHINH LA baseline.
--
-- Sua: p_current <= 0 thi lay thang p_round.
--
-- Phai giu y het cong thuc ben client (src/app/lib/scoring.ts :: pullUpRating)
-- de UI fallback va server khong bao gio lech nhau.

set local search_path = public;

create or replace function public.apply_round_rating(
  p_current integer,
  p_round integer
)
returns integer
language sql
immutable
strict
as $$
  select case
    -- Van te hon hoac bang: giu nguyen. Chi decay moi keo diem xuong.
    when p_round <= greatest(0, least(1000, p_current))
      then greatest(0, least(1000, p_current))

    -- COLD START: chua co baseline => van dau tien la baseline, khong lam tron.
    when greatest(0, least(1000, p_current)) <= 0
      then greatest(0, least(1000, p_round))

    -- Khoang cach con lai du nho thi nhay thang, tranh tiem can mai o 999.
    when p_round - greatest(0, least(1000, p_current)) <= 3
      then greatest(0, least(1000, p_round))

    -- Con lai: keo len 40% khoang cach, toi thieu +1.
    else least(1000, greatest(
      greatest(0, least(1000, p_current)) + 1,
      round(
        greatest(0, least(1000, p_current))
        + 0.4 * (p_round - greatest(0, least(1000, p_current)))
      )::integer
    ))
  end;
$$;

revoke all on function public.apply_round_rating(integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_round_rating(integer, integer)
  to service_role;

-- Chot lai: dam bao khong con ban overload float8 nao (xem 20260817).
do $$
begin
  if (
    select count(*) from pg_proc
    where proname = 'apply_round_rating'
      and pronamespace = 'public'::regnamespace
  ) <> 1 then
    raise exception
      'apply_round_rating co nhieu ban overload — chay 20260817 truoc';
  end if;

  if public.apply_round_rating(0, 300) <> 300 then
    raise exception 'cold start chua duoc sua: apply_round_rating(0,300) = %',
      public.apply_round_rating(0, 300);
  end if;

  if public.apply_round_rating(500, 600) <> 540 then
    raise exception 'cong thuc EMA bi doi ngoai y muon: (500,600) = %',
      public.apply_round_rating(500, 600);
  end if;

  raise notice 'OK: cold start da sua, EMA giu nguyen';
end $$;
