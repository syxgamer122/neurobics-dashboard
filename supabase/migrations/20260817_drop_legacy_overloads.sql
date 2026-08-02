-- 20260817_drop_legacy_overloads.sql
--
-- Don cac ban OVERLOAD doi cu con sot lai trong DB.
--
-- VAN DE:
-- `create or replace function` chi thay the khi CHU KY trung khop. Cac ban dau
-- cua du an dinh nghia helper bang `double precision` / `text`, sau do migration
-- moi doi sang `numeric` / `date`. Ket qua la CA HAI ban cung ton tai.
--
-- Vi sao nguy hiem: khi goi decay_rating(<cot integer>, <integer>), khong ban
-- nao khop chinh xac nen Postgres phai ep kieu ngam. Luc hoa, no chon theo
-- KIEU UU TIEN cua nhom numeric — va kieu uu tien do la `double precision`.
-- Nghia la ban DOI CU duoc goi, con ban `numeric` ma cac migration 20260811 /
-- 20260813 / 20260815 cap nhat thi khong bao gio chay. Toan bo logic decay va
-- coverage shrinkage bi vo hieu ma khong he bao loi.
--
-- Tuong tu voi submit_round_transaction: ban 5 tham so tu 20260731 khong bi
-- ghi de khi 20260807 them p_label/p_time_ms thanh 7 tham so.
--
-- LUU Y: co tinh KHONG dung `cascade`. Neu con thu gi phu thuoc vao ban cu,
-- lenh drop se bao loi thay vi am tham xoa lan sang thu khac — do la hanh vi
-- mong muon.

set local search_path = public;

begin;

-- ---------------------------------------------------------------------------
-- 1. submit_round_transaction: ban 5 tham so (20260731), thieu anticheat/XP/decay
-- ---------------------------------------------------------------------------
drop function if exists public.submit_round_transaction(
  uuid, uuid, text, jsonb, integer
);

-- ---------------------------------------------------------------------------
-- 2. Helper: giu ban numeric/date, bo ban double precision/text
-- ---------------------------------------------------------------------------
drop function if exists public.apply_round_rating(double precision, integer);

drop function if exists public.decay_rating(double precision, integer);

drop function if exists public.idle_days_vn(text);

drop function if exists public.decayed_cognitive_index(
  double precision, double precision, double precision,
  double precision, double precision, text
);

drop function if exists public.decayed_cognitive_index(
  double precision, double precision, double precision,
  double precision, double precision, date
);

-- ---------------------------------------------------------------------------
-- 3. Chot: moi ten ham chi con dung MOT ban
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
  v_count integer;
begin
  for v_name, v_count in
    select p.proname, count(*)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'submit_round_transaction', 'apply_round_rating', 'decay_rating',
        'idle_days_vn', 'decayed_cognitive_index', 'axes_covered'
      )
    group by p.proname
    having count(*) > 1
  loop
    raise exception
      'Van con % ban cua public.%() — khong the dam bao goi trung ban dung',
      v_count, v_name;
  end loop;

  raise notice 'OK: moi helper chi con mot ban duy nhat';
end $$;

commit;
