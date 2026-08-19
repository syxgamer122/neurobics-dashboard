SET lock_timeout = '2s';
-- 0. Ensure level & rating_model_version exist on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS rating_model_version integer NOT NULL DEFAULT 1;

UPDATE public.profiles
SET level = GREATEST(
  1,
  FLOOR(
    (-1 + SQRT(
      1 + GREATEST(COALESCE(total_xp, 0), 0)::numeric / 12.5
    )) / 2
  )::integer + 1
);

-- ==============================================================================
-- 20260910000002_public_leaderboard.sql
-- ==============================================================================

-- Create a secure view for the public leaderboard
create or replace view public.public_leaderboard as
select
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  p.level,
  public.decayed_cognitive_index(
    p.algebraic_logic_score,
    p.memory_score,
    p.speed_score,
    p.focus_score,
    p.cfop_spatial_record,
    p.last_active_date
  ) as cognitive_index
from public.profiles p
where not p.flagged;

-- Grant access to the view
grant select on public.public_leaderboard to authenticated, anon;
