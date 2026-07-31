-- =============================================================================
-- 20260805_leaderboard_popstats.sql
-- Giai đoạn 4.5: leaderboard + population stats tính trên Postgres.
-- =============================================================================

-- Cột generated: trung bình 5 trục nhận thức (0–1000).
alter table public.profiles
  add column if not exists cognitive_index double precision
  generated always as (
    (
      coalesce(algebraic_logic_score, 0)
      + coalesce(memory_score, 0)
      + coalesce(speed_score, 0)
      + coalesce(focus_score, 0)
      + coalesce(cfop_spatial_record, 0)
    ) / 5.0
  ) stored;

create index if not exists profiles_cognitive_index_desc_idx
  on public.profiles (cognitive_index desc nulls last);

-- Top N theo cognitive_index (mặc định 25).
create or replace function public.get_leaderboard(p_limit integer default 25)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  order by cognitive_index desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to authenticated;

-- Mean / sample-stddev của Cognitive Index cho người chơi đã hiệu chuẩn (≥5 ván).
create or replace function public.get_population_stats(p_min_rounds integer default 5)
returns table(mean double precision, sd double precision, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  with calibrated as (
    select cognitive_index as idx
    from public.profiles
    where (
      coalesce(schulte_sessions, 0)
      + coalesce(sudoku_sessions, 0)
      + coalesce(stroop_sessions, 0)
      + coalesce(reaction_sessions, 0)
      + coalesce(memory_sessions, 0)
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
