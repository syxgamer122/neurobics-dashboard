-- Luu y: prune_observability_events() xoa log cu hon N ngay (co chu dich, khong pha du lieu nghiep vu).
-- Observability: mot bang duy nhat cho loi/su kien tu client va server.
--
-- Truoc day khong co gi ca: loi client bi logger.ts nuot o production, loi
-- server chi nam trong log Supabase 24 gio va khong dem duoc. Bang nay la noi
-- duy nhat de tra loi: "hom nay co bao nhieu nguoi bi loi gi, o dau".
--
-- Bao mat: RLS bat, KHONG co policy nao => anon/authenticated khong doc/ghi
-- truc tiep duoc. Chi service_role (Edge Function) ghi, va admin doc qua ham
-- security definer ben duoi.

create table if not exists public.observability_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('client', 'server')),
  level text not null check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  event text not null,
  message text,
  route text,
  game text,
  release text,
  session_id text,
  user_id uuid,
  request_id text,
  duration_ms integer,
  status_code integer,
  fingerprint text not null,
  count integer not null default 1 check (count > 0),
  context jsonb not null default '{}'::jsonb
);

-- Xoa user khong duoc lam mat log (chi bo lien ket).
do $$
begin
  alter table public.observability_events
    add constraint observability_events_user_fk
    foreign key (user_id) references auth.users (id) on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

create index if not exists observability_events_created_idx
  on public.observability_events (created_at desc);
create index if not exists observability_events_level_created_idx
  on public.observability_events (level, created_at desc);
create index if not exists observability_events_fingerprint_idx
  on public.observability_events (fingerprint, created_at desc);
create index if not exists observability_events_event_idx
  on public.observability_events (event, created_at desc);

alter table public.observability_events enable row level security;
revoke all on table public.observability_events from anon, authenticated;

-- ─── Doc lieu cho admin ──────────────────────────────────────────────

-- Nhom theo van tay loi: dung de biet "loi nao dang gay hai nhat".
create or replace function public.observability_summary(p_hours integer default 24)
returns table (
  fingerprint text,
  level text,
  event text,
  sample_message text,
  occurrences bigint,
  sessions bigint,
  users bigint,
  first_seen timestamptz,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 24 * 90);
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    e.fingerprint,
    e.level,
    min(e.event) as event,
    (array_agg(e.message order by e.created_at desc))[1] as sample_message,
    sum(e.count)::bigint as occurrences,
    count(distinct e.session_id)::bigint as sessions,
    count(distinct e.user_id)::bigint as users,
    min(e.created_at) as first_seen,
    max(e.created_at) as last_seen
  from public.observability_events e
  where e.created_at > now() - make_interval(hours => v_hours)
    and e.level in ('warn', 'error', 'fatal')
  group by e.fingerprint, e.level
  order by occurrences desc
  limit 200;
end;
$$;

-- Suc khoe theo gio: tong su kien, so loi, thoi gian xu ly p95 xap xi.
create or replace function public.observability_health(p_hours integer default 24)
returns table (
  bucket timestamptz,
  events bigint,
  errors bigint,
  warns bigint,
  p95_duration_ms integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours integer := least(greatest(coalesce(p_hours, 24), 1), 24 * 30);
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    date_trunc('hour', e.created_at) as bucket,
    sum(e.count)::bigint as events,
    sum(case when e.level in ('error', 'fatal') then e.count else 0 end)::bigint as errors,
    sum(case when e.level = 'warn' then e.count else 0 end)::bigint as warns,
    percentile_disc(0.95) within group (order by coalesce(e.duration_ms, 0))::integer as p95_duration_ms
  from public.observability_events e
  where e.created_at > now() - make_interval(hours => v_hours)
  group by 1
  order by 1 desc;
end;
$$;

-- Don rac: giu 30 ngay la du de dieu tra ma khong phinh database.
create or replace function public.prune_observability_events(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_deleted integer;
begin
  if auth.role() is distinct from 'service_role'
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     )
  then
    raise exception 'Admin access required';
  end if;

  delete from public.observability_events
  where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.observability_summary(integer) from public;
revoke all on function public.observability_health(integer) from public;
revoke all on function public.prune_observability_events(integer) from public;
grant execute on function public.observability_summary(integer) to authenticated;
grant execute on function public.observability_health(integer) to authenticated;
grant execute on function public.prune_observability_events(integer) to authenticated, service_role;

comment on table public.observability_events is
  'Loi/su kien tu client va Edge Function. Chi service_role ghi; admin doc qua observability_summary()/observability_health().';

-- Tuy chon: neu bat extension pg_cron, hen don rac hang ngay luc 03:10 UTC.
--   select cron.schedule('prune-observability', '10 3 * * *',
--     $$select public.prune_observability_events(30)$$);
