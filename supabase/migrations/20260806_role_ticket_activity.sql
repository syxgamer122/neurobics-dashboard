-- =============================================================================
-- 20260806_role_ticket_activity.sql
-- 1) Cột role trên profiles (server-controlled)
-- 2) is_admin() đọc role, không hardcode username
-- 3) Reserve username admin + chặn client đổi role
-- 4) RPC aggregate activity stats
-- =============================================================================

-- 1) role: chỉ 'user' | 'admin'. Default 'user'.
alter table public.profiles
  add column if not exists role text not null default 'user';

-- Backfill: tài khoản admin hiện tại (một lần).
update public.profiles
set role = 'admin'
where lower(trim(username)) = 'nguyenhuumanh'
  and role is distinct from 'admin';

-- Chỉ cho phép hai giá trị hợp lệ.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user', 'admin'));
  end if;
end $$;

-- Client authenticated KHÔNG được tự ghi cột role (chỉ service_role / admin SQL).
revoke update (role) on public.profiles from authenticated, anon;

-- 2) is_admin() — đọc role của auth.uid(), security definer.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3) Bảng username bị cấm đăng ký (không lộ logic admin chỉ bằng một chuỗi duy nhất).
create table if not exists public.reserved_usernames (
  username text primary key
);

insert into public.reserved_usernames (username) values
  ('nguyenhuumanh'),
  ('admin'),
  ('administrator'),
  ('root'),
  ('system'),
  ('neurobics')
on conflict do nothing;

alter table public.reserved_usernames enable row level security;
-- Không policy SELECT cho authenticated → client không đọc được danh sách.
revoke all on public.reserved_usernames from authenticated, anon;
grant all on public.reserved_usernames to service_role;

-- 4) Activity stats: aggregate trên server (VN timezone).
create or replace function public.get_activity_stats()
returns table(xp_today integer, sessions_this_month integer)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
        at time zone 'Asia/Ho_Chi_Minh') as day_start,
      (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')
        at time zone 'Asia/Ho_Chi_Minh') as month_start
  )
  select
    coalesce(sum(case when e.created_at >= b.day_start then e.xp_awarded else 0 end), 0)::integer
      as xp_today,
    count(*)::integer as sessions_this_month
  from public.xp_events e
  cross join bounds b
  where e.user_id = auth.uid()
    and e.created_at >= b.month_start;
$$;

revoke all on function public.get_activity_stats() from public;
grant execute on function public.get_activity_stats() to authenticated;
