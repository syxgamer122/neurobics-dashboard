-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811_decay_recovery.sql
-- 1) Decay điểm theo idle days NGAY TRONG SQL (leaderboard + pop stats khớp UI)
-- 2) Cột recovery_code_hash cho khôi phục mật khẩu (email giả @neurobics.local)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Recovery code ──────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists recovery_code_hash text;

revoke update (recovery_code_hash) on public.profiles from authenticated, anon;
-- service_role giữ full access qua bypass RLS.

-- ─── Hàm decay (khớp client: grace 7 ngày, -2%/tuần, sàn 35% peak) ───────────
create or replace function public.decay_rating(p_value numeric, p_idle_days integer)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_value, 0) <= 0 then 0
    when coalesce(p_idle_days, 0) <= 7 then
      greatest(0, least(1000, round(p_value)::integer))
    else
      greatest(
        0,
        least(
          1000,
          round(
            greatest(
              p_value * power(1.0 - 0.02, (p_idle_days - 7)::numeric / 7.0),
              p_value * 0.35
            )
          )::integer
        )
      )
  end;
$$;

revoke all on function public.decay_rating(numeric, integer) from public, anon;
grant execute on function public.decay_rating(numeric, integer) to authenticated, service_role;

-- Số ngày idle tính theo lịch VN (khớp last_active_date YYYY-MM-DD VN).
create or replace function public.idle_days_vn(p_last_active date)
returns integer
language sql
stable
as $$
  select case
    when p_last_active is null then 0
    else greatest(
      0,
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date - p_last_active)
    )
  end;
$$;

revoke all on function public.idle_days_vn(date) from public, anon;
grant execute on function public.idle_days_vn(date) to authenticated, service_role;

-- Cognitive index SAU decay (dùng cho xếp hạng + brain-age baseline).
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
  )
  select (
    public.decay_rating(p_logic,   d.idle)
    + public.decay_rating(p_memory,  d.idle)
    + public.decay_rating(p_speed,   d.idle)
    + public.decay_rating(p_focus,   d.idle)
    + public.decay_rating(coalesce(p_spatial, 0), d.idle)
  ) / 5.0
  from d;
$$;

revoke all on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  from public, anon;
grant execute on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  to authenticated, service_role;

-- ─── Leaderboard: sắp xếp theo index ĐÃ decay ───────────────────────────────
-- Không còn returns setof profiles (tránh 42P13 khi schema profiles đổi).
drop function if exists public.get_leaderboard(integer);
create or replace function public.get_leaderboard(p_limit integer default 25)
returns table (
  id uuid,
  username text,
  avatar_url text,
  algebraic_logic_score integer,
  memory_score integer,
  speed_score integer,
  focus_score integer,
  cfop_spatial_record integer,
  synapse_streak integer,
  total_xp bigint,
  last_active_date date,
  schulte_sessions integer,
  sudoku_sessions integer,
  stroop_sessions integer,
  reaction_sessions integer,
  memory_sessions integer,
  nback_sessions integer,
  math_sessions integer,
  created_at timestamptz,
  cognitive_index double precision,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    public.decay_rating(p.algebraic_logic_score, public.idle_days_vn(p.last_active_date)) as algebraic_logic_score,
    public.decay_rating(p.memory_score,          public.idle_days_vn(p.last_active_date)) as memory_score,
    public.decay_rating(p.speed_score,           public.idle_days_vn(p.last_active_date)) as speed_score,
    public.decay_rating(p.focus_score,           public.idle_days_vn(p.last_active_date)) as focus_score,
    public.decay_rating(coalesce(p.cfop_spatial_record, 0), public.idle_days_vn(p.last_active_date)) as cfop_spatial_record,
    p.synapse_streak,
    p.total_xp,
    p.last_active_date,
    p.schulte_sessions,
    p.sudoku_sessions,
    p.stroop_sessions,
    p.reaction_sessions,
    p.memory_sessions,
    p.nback_sessions,
    p.math_sessions,
    p.created_at,
    public.decayed_cognitive_index(
      p.algebraic_logic_score,
      p.memory_score,
      p.speed_score,
      p.focus_score,
      p.cfop_spatial_record,
      p.last_active_date
    ) as cognitive_index,
    p.role::text
  from public.profiles p
  where coalesce(p.flagged, false) = false
  order by 20 desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to authenticated;

-- ─── Population stats: mean/sd trên index đã decay ──────────────────────────
drop function if exists public.get_population_stats(integer);
create or replace function public.get_population_stats(p_min_rounds integer default 5)
returns table(mean double precision, sd double precision, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  with calibrated as (
    select public.decayed_cognitive_index(
      algebraic_logic_score,
      memory_score,
      speed_score,
      focus_score,
      cfop_spatial_record,
      last_active_date
    ) as idx
    from public.profiles
    where coalesce(flagged, false) = false
      and (
        coalesce(schulte_sessions, 0)
        + coalesce(sudoku_sessions, 0)
        + coalesce(stroop_sessions, 0)
        + coalesce(reaction_sessions, 0)
        + coalesce(memory_sessions, 0)
        + coalesce(nback_sessions, 0)
        + coalesce(math_sessions, 0)
      ) >= greatest(1, coalesce(p_min_rounds, 5))
  )
  select
    avg(idx)::double precision as mean,
    coalesce(stddev_samp(idx), 0)::double precision as sd,
    count(*)::bigint as n
  from calibrated;
$$;

revoke all on function public.get_population_stats(integer) from public;
grant execute on function public.get_population_stats(integer) to authenticated;

-- Friend leaderboard cũng decay
drop function if exists public.get_friend_leaderboard();
create or replace function public.get_friend_leaderboard()
returns table(
  id uuid,
  username text,
  avatar_url text,
  cognitive_index double precision,
  total_xp bigint,
  synapse_streak integer,
  is_self boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with circle as (
    select auth.uid() as uid
    union
    select case
             when f.requester_id = auth.uid() then f.addressee_id
             else f.requester_id
           end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    p.id,
    p.username,
    p.avatar_url,
    public.decayed_cognitive_index(
      p.algebraic_logic_score,
      p.memory_score,
      p.speed_score,
      p.focus_score,
      p.cfop_spatial_record,
      p.last_active_date
    ) as cognitive_index,
    p.total_xp,
    p.synapse_streak,
    (p.id = auth.uid()) as is_self
  from public.profiles p
  join circle c on c.uid = p.id
  where auth.uid() is not null
    and coalesce(p.flagged, false) = false
  order by 4 desc nulls last
  limit 100;
$$;

revoke all on function public.get_friend_leaderboard() from public, anon;
grant execute on function public.get_friend_leaderboard() to authenticated;
