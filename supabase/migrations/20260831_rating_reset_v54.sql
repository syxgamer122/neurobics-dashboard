-- 20260831_rating_reset_v54.sql
--
-- RESET TOAN BO RATING SAU KHI HIEU CHUAN LAI CONG THUC (v54).
--
-- LY DO PHAI RESET:
-- v54 doi cong thuc cham diem cua CA 11 game (bo bao hoa truc Speed, nen dai do
-- kho, dong bo tran cac truc, va va hai lo hong Go/No-Go). Rating tren profiles
-- khong phai diem cua mot van, ma la trung binh dong (EMA, alpha 0.4 len /
-- 0.28 xuong) cua nhieu van. Neu giu rating cu, moi nguoi choi se co mot con so
-- TRON hai he quy chieu khac nhau trong nhieu tuan:
--   * Brain Age va Cognitive Index deu doc tu 5 cot rating nay, nen ca hai se
--     troi khong the giai thich duoc.
--   * Nguoi tung khai thac lo hong Go/No-Go (bam moi o => 572 diem/van) dang
--     giu rating khong bao gio kiem duoc lai bang cach choi that.
--   * Bang xep hang se so nguoi choi he cu voi nguoi choi he moi.
--
-- PHAM VI: CHI reset 5 truc nhan thuc + cognitive_index.
-- KHONG dung den XP, level, streak, badge, quest hay so van da choi — do la
-- thanh tich lich su, khong phai thang do nang luc, nen khong bi anh huong boi
-- viec doi cong thuc. Nguoi choi giu nguyen level va badge, chi phai choi lai
-- de dung lai 5 chi so.
--
-- CHAY MOT LAN. Chay lai lan nua se xoa tien do nguoi choi vua kiem duoc.

begin;

-- Ghi lai anh chup truoc khi reset, de con doi chieu neu can.
create table if not exists public.rating_reset_archive (
  user_id                 uuid not null,
  reset_at                timestamptz not null default now(),
  reason                  text not null,
  algebraic_logic_score   double precision,
  memory_score            double precision,
  speed_score             double precision,
  focus_score             double precision,
  cfop_spatial_record     double precision,
  cognitive_index         double precision,
  primary key (user_id, reset_at)
);

-- Bang luu tru chi danh cho quan tri: khoa het moi truy cap tu phia client.
alter table public.rating_reset_archive enable row level security;
revoke all on public.rating_reset_archive from public, anon, authenticated;

insert into public.rating_reset_archive (
  user_id, reason,
  algebraic_logic_score, memory_score, speed_score,
  focus_score, cfop_spatial_record, cognitive_index
)
select
  p.id, 'v54 scoring recalibration',
  p.algebraic_logic_score, p.memory_score, p.speed_score,
  p.focus_score, p.cfop_spatial_record, p.cognitive_index
from public.profiles p
where coalesce(p.algebraic_logic_score, 0) > 0
   or coalesce(p.memory_score, 0) > 0
   or coalesce(p.speed_score, 0) > 0
   or coalesce(p.focus_score, 0) > 0
   or coalesce(p.cfop_spatial_record, 0) > 0
   or coalesce(p.cognitive_index, 0) > 0;

update public.profiles set
  algebraic_logic_score = 0,
  memory_score          = 0,
  speed_score           = 0,
  focus_score           = 0,
  cfop_spatial_record   = 0,
  cognitive_index       = 0;

-- Tu kiem tra: khong con rating nao khac 0, va da luu tru du so ban ghi.
do $$
declare
  v_left     integer;
  v_archived integer;
begin
  select count(*) into v_left
  from public.profiles
  where coalesce(algebraic_logic_score, 0) <> 0
     or coalesce(memory_score, 0) <> 0
     or coalesce(speed_score, 0) <> 0
     or coalesce(focus_score, 0) <> 0
     or coalesce(cfop_spatial_record, 0) <> 0
     or coalesce(cognitive_index, 0) <> 0;

  if v_left > 0 then
    raise exception 'Reset that bai: con % ho so co rating khac 0', v_left;
  end if;

  select count(*) into v_archived
  from public.rating_reset_archive
  where reason = 'v54 scoring recalibration';

  raise notice 'OK: da reset 5 truc + cognitive_index ve 0. Da luu tru % ho so co rating cu. XP, level, streak, badge va so van KHONG bi thay doi.', v_archived;
end $$;

commit;
