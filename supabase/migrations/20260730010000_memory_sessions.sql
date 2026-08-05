alter table public.profiles
add column if not exists memory_sessions integer not null default 0;