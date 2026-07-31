-- =============================================================================
-- 20260803_profiles_rls_hardening.sql
--
-- Siết lại quyền ghi trên bảng public.profiles.
--
-- Ảnh chụp pg_policies cho thấy 6 policy, trong đó có:
--   * "Cho phép người dùng tự sửa điểm"  (UPDATE)  <- thừa và sai định hướng
--   * "admin_update_all"                 (UPDATE)  <- cần biết điều kiện USING
--   * "admin_delete_all"                 (DELETE)  <- nếu USING (true) thì ai
--                                                     cũng xoá được hồ sơ người khác
--
-- Migration này viết lại toàn bộ policy ghi theo hướng tối thiểu quyền.
-- Chạy được nhiều lần, không hỏng dữ liệu.
-- =============================================================================

-- 1) Bảo đảm RLS thật sự bật (idempotent).
alter table public.profiles enable row level security;
-- Kể cả chủ sở hữu bảng cũng phải tuân theo policy.
alter table public.profiles force row level security;

-- 2) Hàm tiện ích: người đang đăng nhập có phải admin không.
--    Dùng security definer để tự đọc được bảng profiles mà không đệ quy policy.
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
      and p.username = 'nguyenhuumanh'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3) Dọn sạch các policy ghi cũ.
drop policy if exists "Cho phép người dùng tự sửa điểm" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists admin_update_all on public.profiles;
drop policy if exists admin_delete_all on public.profiles;

-- 4) INSERT: chỉ được tạo hồ sơ mang chính id của mình.
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- 5) UPDATE: chỉ sửa được hàng của mình, và không được đổi id sang người khác.
--    Các cột điểm đã bị revoke ở migration 20260731, nên policy này thực chất
--    chỉ còn cho phép sửa username / birth_year.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 6) UPDATE của admin: có điều kiện rõ ràng, không phải USING (true).
create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7) DELETE: người dùng tự xoá tài khoản mình, hoặc admin xoá.
create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- 8) SELECT giữ nguyên policy cũ ("Profiles are viewable by authenticated
--    users") vì bảng xếp hạng cần đọc chéo. Phần lộ dữ liệu riêng tư đã được
--    xử lý ở phía client bằng LEADERBOARD_COLS thay cho select("*").

-- 9) Chốt lại: các cột điểm vẫn phải nằm ngoài tầm với của client.
--    (Lặp lại từ 20260731 cho chắc, phòng khi ai đó grant lại bằng tay.)
revoke update (
  algebraic_logic_score,
  memory_score,
  speed_score,
  focus_score,
  cfop_spatial_record,
  synapse_streak,
  last_active_date,
  schulte_sessions,
  sudoku_sessions,
  stroop_sessions,
  reaction_sessions,
  memory_sessions,
  total_xp
) on public.profiles from authenticated, anon;

-- =============================================================================
-- Kiểm tra sau khi chạy:
--   select relrowsecurity, relforcerowsecurity
--     from pg_class where relname = 'profiles';
--   select policyname, cmd, qual, with_check
--     from pg_policies where tablename = 'profiles' order by cmd, policyname;
-- =============================================================================
