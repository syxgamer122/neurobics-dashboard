-- 20260829_xp_security_hardening.sql
--
-- Ket qua ra soat toan he thong (v52), sau khi 20260827 + 20260828 da chay.
-- Ba loi con lai, xep theo muc do nghiem trong.
--
-- ===========================================================================
-- LOI 1 - NGHIEM TRONG (BAO MAT): public.award_xp(text, integer) van song
-- ===========================================================================
--   File 20260730_xp_system.sql tao ham award_xp() va cap quyen:
--       grant execute on function public.award_xp(text, integer) to authenticated;
--
--   Ham nay TU GHI xp_events va TU CONG profiles.total_xp:
--       insert into public.xp_events (user_id, game, round_score, xp_awarded)
--       update public.profiles set total_xp = total_xp + v_xp
--
--   Tu 20260731 toan bo viec cong XP da chuyen sang submit_round_transaction()
--   voi round_tickets + anticheat + Edge Function. Ra soat toan bo ma nguon:
--   KHONG con cho nao goi award_xp() nua. Nhung quyen execute cho
--   `authenticated` thi chua bao gio bi thu hoi.
--
--   HAU QUA: bat ky nguoi dung DA DANG NHAP nao cung co the mo Console va goi
--       supabase.rpc('award_xp', { p_game: 'schulte', p_round_score: 1000 })
--   de tu cong XP MA KHONG CAN CHOI:
--       - 35 XP moi 3 giay, toi 300 XP/ngay
--       - khong qua round_tickets, khong qua anticheat, khong ghi
--         training_sessions -> khong de lai dau vet trong lich su
--   Dieu nay lam sai level, sai bang xep hang va mo khoa badge gia.
--
--   Ham nay con giu whitelist 5 game doi dau ('schulte','sudoku','stroop',
--   'memory','reaction'), tuc la ma da chet han tu lau.
--
--   SUA: xoa hang. Khong con ai goi thi khong giu lai be mat tan cong.
--
-- ===========================================================================
-- LOI 2 - TRUNG BINH (bay ngam, cung ho voi su co v50)
-- ===========================================================================
--   training_sessions.xp_awarded khai bao trong 20260801_training_history.sql
--   bang mot rang buoc VO DANH:
--       xp_awarded integer not null default 0 check (xp_awarded between 0 and 100)
--
--   Vi khong co ten, khong migration nao sau nay co the `drop constraint
--   if exists ...` de noi ra. Day dung la co che da gay ra su co v50 tren
--   xp_events: mot tran cu ket lai, chan het quest tuan va badge.
--
--   Hien tai XP moi van toi da 35 nen chua vo, nhung tran nay se no ngay lan
--   dau tien co bonus XP cho mot van choi.
--
--   SUA: dat TEN cho rang buoc va noi len 0..1000 cho khop xp_events.
--
-- ===========================================================================
-- LOI 3 - TRUNG BINH: admin cong XP nhung badge khong duoc danh gia lai
-- ===========================================================================
--   sync_achievements_for(uuid) o 20260827 bi thu hoi khoi MOI role:
--       revoke all on function public.sync_achievements_for(uuid)
--         from public, anon, authenticated;
--   Lenh `revoke ... from public` cung lay luon quyen mac dinh cua
--   service_role, nen Edge Function KHONG THE goi ham nay.
--
--   Ket qua: endpoint /server/admin-grant chi update profiles.total_xp roi
--   dung. Badge chi duoc dong bo khi nguoi dung TU MO bang thanh tuu. Tai
--   khoan duoc admin keo len level 7 van trong tron badge cho den luc do.
--
--   SUA: cap execute cho service_role (chi service_role, khong mo cho client)
--   de server goi duoc sau khi cong XP.

set local search_path = public;

begin;

-- ---------------------------------------------------------------------------
-- 1) Xoa ham award_xp() da chet nhung van cho phep tu cong XP
-- ---------------------------------------------------------------------------
-- Co tinh KHONG dung `cascade`: neu con thu gi that su phu thuoc vao ham nay,
-- lenh drop se bao loi thay vi am tham xoa lan sang thu khac.
drop function if exists public.award_xp(text, integer);

-- ---------------------------------------------------------------------------
-- 2) Dat ten + noi tran xp_awarded cua training_sessions
-- ---------------------------------------------------------------------------
-- Rang buoc goc vo danh nen phai tim theo dinh nghia roi bo di.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.training_sessions'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%xp_awarded%'
  loop
    execute format(
      'alter table public.training_sessions drop constraint %I', r.conname
    );
    raise notice 'Da bo rang buoc xp_awarded cu: %', r.conname;
  end loop;
end $$;

alter table public.training_sessions
  add constraint training_sessions_xp_awarded_check
  check (xp_awarded between 0 and 1000);

-- ---------------------------------------------------------------------------
-- 3) Cho Edge Function (service_role) dong bo badge sau khi admin cong XP
-- ---------------------------------------------------------------------------
-- Van KHONG mo cho anon/authenticated: client chi duoc goi sync_achievements()
-- (tu suy ra auth.uid()), khong duoc chi dinh uuid nguoi khac.
grant execute on function public.sync_achievements_for(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Chot lai: khong tin loi thong bao, kiem tra bang du lieu he thong
-- ---------------------------------------------------------------------------
do $$
declare
  v_award_left integer;
  v_def text;
  v_service_ok boolean;
begin
  -- 4a) award_xp phai bien mat hoan toan (moi overload)
  select count(*) into v_award_left
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'award_xp';

  if v_award_left > 0 then
    raise exception
      'Van con % ban public.award_xp() - be mat tu cong XP chua duoc dong',
      v_award_left;
  end if;

  -- 4b) training_sessions.xp_awarded phai co rang buoc CO TEN, tran 1000
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  where con.conrelid = 'public.training_sessions'::regclass
    and con.conname = 'training_sessions_xp_awarded_check';

  if v_def is null then
    raise exception 'Thieu rang buoc training_sessions_xp_awarded_check';
  end if;

  if v_def not like '%1000%' then
    raise exception
      'training_sessions_xp_awarded_check chua duoc noi len 1000: %', v_def;
  end if;

  -- 4c) service_role phai goi duoc sync_achievements_for
  select has_function_privilege(
           'service_role',
           'public.sync_achievements_for(uuid)',
           'execute'
         )
    into v_service_ok;

  if not coalesce(v_service_ok, false) then
    raise exception
      'service_role chua co quyen execute sync_achievements_for(uuid)';
  end if;

  -- 4d) client KHONG duoc phep chi dinh uuid nguoi khac
  if has_function_privilege(
       'authenticated',
       'public.sync_achievements_for(uuid)',
       'execute'
     ) then
    raise exception
      'authenticated van goi duoc sync_achievements_for(uuid) - phai thu hoi';
  end if;

  raise notice 'OK: award_xp da xoa, tran xp_awarded da dat ten, service_role da co quyen dong bo badge';
end $$;

commit;
