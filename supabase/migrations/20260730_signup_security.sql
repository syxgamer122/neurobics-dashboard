-- Persistent, atomic rate limit for the public signup Edge Function.
-- Raw IP addresses are never stored; the function receives a SHA-256 hash.
create table if not exists public.signup_rate_limits (
  client_key text primary key,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0
);

alter table public.signup_rate_limits enable row level security;
revoke all on table public.signup_rate_limits from anon, authenticated;

create or replace function public.check_signup_rate_limit(
  p_key text,
  p_limit integer default 5,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into public.signup_rate_limits as limits (client_key, window_start, attempt_count)
  values (p_key, now(), 1)
  on conflict (client_key) do update
  set
    attempt_count = case
      when limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1
      else limits.attempt_count + 1
    end,
    window_start = case
      when limits.window_start <= now() - make_interval(secs => p_window_seconds) then now()
      else limits.window_start
    end
  returning attempt_count <= greatest(1, p_limit) into allowed;

  return allowed;
end;
$$;

revoke all on function public.check_signup_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_signup_rate_limit(text, integer, integer) to service_role;

-- Optional cleanup; safe to run periodically.
delete from public.signup_rate_limits
where window_start < now() - interval '7 days';
