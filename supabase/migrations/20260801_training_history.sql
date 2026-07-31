-- Giai đoạn 2: lịch sử luyện tập + kỷ lục cá nhân
create extension if not exists pgcrypto;

create table if not exists public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  game          text not null check (game in ('schulte','sudoku','stroop','reaction','memory')),
  label         text,
  round_score   integer not null check (round_score between 0 and 1000),
  xp_awarded    integer not null default 0 check (xp_awarded between 0 and 100),
  time_ms       integer not null check (time_ms between 0 and 7200000),
  speed_score   integer check (speed_score   between 0 and 1000),
  focus_score   integer check (focus_score   between 0 and 1000),
  spatial_score integer check (spatial_score between 0 and 1000),
  logic_score   integer check (logic_score   between 0 and 1000),
  memory_score  integer check (memory_score  between 0 and 1000),
  created_at    timestamptz not null default now()
);

create index if not exists training_sessions_user_time_idx
  on public.training_sessions (user_id, created_at desc);
create index if not exists training_sessions_user_game_score_idx
  on public.training_sessions (user_id, game, round_score desc);

alter table public.training_sessions enable row level security;

-- Người chơi CHỈ được đọc lịch sử của chính mình. Không có policy insert/update/delete
-- cho browser: chỉ Edge Function (service_role) mới được ghi, giống round_tickets.
drop policy if exists training_sessions_select_own on public.training_sessions;
create policy training_sessions_select_own
  on public.training_sessions for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.training_sessions from authenticated, anon;
grant select on public.training_sessions to authenticated;
grant all on public.training_sessions to service_role;

-- Kỷ lục cá nhân theo từng game
create or replace function public.get_personal_bests(p_user_id uuid)
returns table (
  game            text,
  rounds          bigint,
  best_score      integer,
  best_time_ms    integer,
  avg_score       numeric,
  total_xp        bigint,
  last_played_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.game,
    count(*)                              as rounds,
    max(s.round_score)                    as best_score,
    min(s.time_ms)                        as best_time_ms,
    round(avg(s.round_score)::numeric, 1) as avg_score,
    sum(s.xp_awarded)                     as total_xp,
    max(s.created_at)                     as last_played_at
  from public.training_sessions s
  where s.user_id = p_user_id
  group by s.game
  order by s.game;
$$;

revoke all on function public.get_personal_bests(uuid) from public, anon;
grant execute on function public.get_personal_bests(uuid) to authenticated, service_role;