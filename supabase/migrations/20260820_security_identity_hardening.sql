-- 20260820: username identity, profile column grants, auth cascade, ticket cleanup

-- Chan migration neu du lieu cu co hai username chi khac hoa/thuong.
do $$
begin
  if exists (
    select lower(trim(username))
    from public.profiles
    group by lower(trim(username))
    having count(*) > 1
  ) then
    raise exception 'Duplicate case-insensitive usernames exist; resolve them before 20260820';
  end if;
end $$;

update public.profiles
set username = lower(trim(username))
where username is distinct from lower(trim(username));

-- Luon luu lowercase, ke ca profile duoc trigger tao tu metadata cu.
create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.username := lower(trim(new.username));
  return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
before insert or update of username on public.profiles
for each row execute function public.normalize_profile_username();

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

-- RLS gioi han row; column grant gioi han chinh xac client duoc sua gi.
revoke update on table public.profiles from authenticated, anon;
grant update (avatar_url, birth_year) on table public.profiles to authenticated;

-- Bao dam profiles.id -> auth.users.id ON DELETE CASCADE.
do $$
declare
  fk record;
begin
  for fk in
    select c.conname, c.confdeltype
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
  loop
    if fk.confdeltype <> 'c' then
      execute format('alter table public.profiles drop constraint %I', fk.conname);
    else
      return;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'c'
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create index if not exists round_tickets_open_user_idx
  on public.round_tickets (user_id, expires_at)
  where submitted_at is null;

-- Don rac cu; ticket con han khong bi dong toi.
delete from public.round_tickets
where expires_at < now() - interval '7 days';

-- Kiem tra grant: authenticated chi con UPDATE hai cot cong khai.
do $$
declare
  allowed text[];
begin
  select array_agg(column_name order by column_name)
  into allowed
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE';

  if allowed is distinct from array['avatar_url','birth_year']::text[] then
    raise exception 'Unexpected authenticated UPDATE columns on profiles: %', allowed;
  end if;
  raise notice 'OK: username unique/lowercase; profile UPDATE allowlist; auth cascade; ticket index';
end $$;
