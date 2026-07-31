-- =============================================================================
-- 20260804_profile_settings.sql
-- Giai đoạn 4: avatar + cột hồ sơ cho trang cài đặt cá nhân.
-- Chạy được nhiều lần (idempotent).
-- =============================================================================

-- 1) Cột avatar (URL công khai trong bucket avatars).
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the user avatar in storage bucket avatars.';

-- 2) Bucket công khai cho avatar (tối đa 2MB, chỉ ảnh).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) Storage policies — mỗi user chỉ đụng được thư mục mang đúng user id của mình.
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4) avatar_url được client tự cập nhật (cùng policy profiles_update_own).
--    Không revoke — cột này an toàn, không phải điểm số.
