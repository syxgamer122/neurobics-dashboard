-- 20260813_cognitive_index_active_axes.sql
-- ──────────────────────────────────────────────────────────────────
-- Truoc day decayed_cognitive_index() chia cung cho 5.0 ke ca khi nguoi choi
-- chua tung dung mot truc nao. Ai chi choi Sudoku bi chia 5 cho 1 truc co
-- diem => index thap gia, brain age gia hon thuc te, va thu hang sai.
--
-- Client (src/app/lib/api.ts :: cognitiveIndex) da doi sang "chi trung binh
-- tren cac truc > 0". Migration nay dong bo cong thuc phia Postgres de
-- leaderboard va population stats khong lech voi so hien tren man hinh.
--
-- Luu y: day la thay doi CO Y NGHIA VE THU HANG. Nguoi choi it truc se tang
-- hang sau khi chay. Do la hanh vi mong muon, nhung hay bao truoc cho
-- nguoi dung neu bang xep hang dang duoc theo doi.

set local search_path = public;

create or replace function public.decayed_cognitive_index(
  p_logic numeric,
  p_memory numeric,
  p_speed numeric,
  p_focus numeric,
  p_spatial numeric,
  p_last_active date
)
returns double precision
language sql
stable
as $$
  with d as (
    select public.idle_days_vn(p_last_active) as idle
  ),
  -- Quan trong: xet truc "da co du lieu" theo diem THO (truoc decay).
  -- Neu xet sau decay, mot truc bi decay ve 0 se tu bien mat khoi mau so
  -- va lam index tang nguoc — dung y nghia cua decay.
  axes as (
    select *
    from (
      values
        (coalesce(p_logic, 0)),
        (coalesce(p_memory, 0)),
        (coalesce(p_speed, 0)),
        (coalesce(p_focus, 0)),
        (coalesce(p_spatial, 0))
    ) as v(raw)
  ),
  active as (
    select public.decay_rating(a.raw, d.idle) as decayed
    from axes a
    cross join d
    where a.raw > 0
  )
  select coalesce(avg(decayed), 0)::double precision
  from active;
$$;

revoke all on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  from public, anon;
grant execute on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  to authenticated, service_role;

-- So truc da co du lieu (0–5). Dung cho UI canh bao "ho so chua day du",
-- doi xung voi axesCovered() ben client.
create or replace function public.axes_covered(
  p_logic numeric,
  p_memory numeric,
  p_speed numeric,
  p_focus numeric,
  p_spatial numeric
)
returns integer
language sql
immutable
as $$
  select (
    (coalesce(p_logic, 0)   > 0)::int
    + (coalesce(p_memory, 0)  > 0)::int
    + (coalesce(p_speed, 0)   > 0)::int
    + (coalesce(p_focus, 0)   > 0)::int
    + (coalesce(p_spatial, 0) > 0)::int
  );
$$;

revoke all on function public.axes_covered(numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.axes_covered(numeric, numeric, numeric, numeric, numeric)
  to authenticated, service_role;

-- Cot cognitive_index tinh san (neu dang duoc dung de sap xep) can duoc
-- tinh lai theo cong thuc moi. Chi cham vao khi cot that su ton tai.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'cognitive_index'
      and is_generated = 'NEVER'
  ) then
    update public.profiles
    set cognitive_index = public.decayed_cognitive_index(
      algebraic_logic_score,
      memory_score,
      speed_score,
      focus_score,
      cfop_spatial_record,
      last_active_date
    );
    raise notice 'profiles.cognitive_index recomputed with active-axes formula';
  else
    raise notice 'profiles.cognitive_index is generated or absent; nothing to backfill';
  end if;
end $$;
