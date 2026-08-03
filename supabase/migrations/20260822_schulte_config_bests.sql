-- 20260822_schulte_config_bests.sql
--
-- Ky luc Schulte tach theo size x mode (3x3 Classic, 5x5 Reverse, ...).
-- Truoc day get_personal_bests chi group theo game nen 3x3 nhanh chiem cho
-- "Best" cua ca Schulte, vo nghia khi so voi 6x6.
--
-- Khong can cot moi: training_sessions.label da luu dang
--   '5×5 Classic' | '5x5 Reverse (failed)' | '4×4 Dual'
-- (client gui modeLabel; scoreSchulte them ' (failed)' khi thua).
--
-- Bao mat: chi doc auth.uid(), khong nhan user_id tu client.

set local search_path = public;

create or replace function public.get_schulte_config_bests()
returns table (
  grid_size      integer,
  mode           text,
  best_time_ms   integer,
  best_score     integer,
  rounds         bigint,
  last_played_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with parsed as (
    select
      s.time_ms,
      s.round_score,
      s.created_at,
      -- '5×5 Classic' / '5x5 Classic (failed)' / '4×4 Dual'
      nullif(substring(s.label from '^([0-9]+)'), '')::integer as grid_size,
      lower(
        coalesce(
          (regexp_match(s.label, '(classic|reverse|dual)', 'i'))[1],
          'classic'
        )
      ) as mode,
      (
        s.label is null
        or s.label not ilike '%(failed)%'
      ) as is_win
    from public.training_sessions s
    where s.user_id = auth.uid()
      and s.game = 'schulte'
      and s.label is not null
      and length(trim(s.label)) > 0
  )
  select
    p.grid_size,
    p.mode,
    -- Chi van THANG moi duoc tinh ky luc thoi gian.
    min(p.time_ms) filter (where p.is_win) as best_time_ms,
    max(p.round_score) filter (where p.is_win) as best_score,
    count(*)::bigint as rounds,
    max(p.created_at) as last_played_at
  from parsed p
  where p.grid_size in (3, 4, 5, 6)
    and p.mode in ('classic', 'reverse', 'dual')
  group by p.grid_size, p.mode
  order by p.grid_size, p.mode;
$$;

comment on function public.get_schulte_config_bests() is
  'Personal Schulte bests split by grid size and mode for the calling user.';

revoke all on function public.get_schulte_config_bests() from public, anon;
grant execute on function public.get_schulte_config_bests() to authenticated, service_role;
