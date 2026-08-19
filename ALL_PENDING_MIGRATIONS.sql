/* =============================================================================
   NEUROBICS DASHBOARD - CONSOLIDATED PENDING MIGRATIONS (UPDATED)
   Total Pending Files: 43
   Range: 20260910000002_public_leaderboard.sql -> 20260929000006_phase43_practice_sessions.sql
   ============================================================================= */

/* -----------------------------------------------------------------------------
   [1/43] File: 20260910000002_public_leaderboard.sql
   ----------------------------------------------------------------------------- */

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

-- Remote DB có cấu trúc cột khác nên phải DROP VIEW trước khi CREATE VIEW
DROP VIEW IF EXISTS public.public_leaderboard;

CREATE VIEW public.public_leaderboard AS
SELECT
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
  ) AS cognitive_index
FROM public.profiles p
WHERE COALESCE(p.flagged, false) = false;

-- Grant access to the view
GRANT SELECT ON public.public_leaderboard TO authenticated, anon;

/* -----------------------------------------------------------------------------
   [2/43] File: 20260910000003_alert_engine.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000003_alert_engine.sql
-- ==============================================================================

-- 1. Table `alerts`
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  message text not null,
  cooldown_until timestamptz,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.alerts enable row level security;
-- Internal table, no direct client access needed

-- 2. Table `cron_runs`
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  error_details text
);

alter table public.cron_runs enable row level security;

-- 3. Function to send webhook and create alert
create or replace function public.trigger_alert(p_rule_name text, p_severity text, p_message text)
returns void
language plpgsql
security definer
as $$
declare
  v_cooldown timestamptz;
  v_webhook_url text;
begin
  -- Check cooldown
  select cooldown_until into v_cooldown
  from public.alerts
  where rule_name = p_rule_name
  order by created_at desc
  limit 1;

  if v_cooldown is not null and v_cooldown > now() then
    return; -- Still in cooldown
  end if;

  -- Insert alert (cooldown 1 hour for P1, 4 hours for others)
  insert into public.alerts (rule_name, severity, message, cooldown_until)
  values (
    p_rule_name, 
    p_severity, 
    p_message, 
    now() + (case when p_severity in ('P0', 'P1') then interval '1 hour' else interval '4 hours' end)
  );

  -- Send webhook if P1/P0 and pg_net extension is available
  -- We use current_setting to get a placeholder webhook URL or actual URL if set
  begin
    v_webhook_url := current_setting('app.slack_webhook_url', true);
    if v_webhook_url is not null and v_webhook_url != '' then
      -- Fire and forget HTTP request
      -- Assuming pg_net is enabled (supabase standard)
      -- If pg_net is not enabled, this will fail gracefully due to the EXCEPTION block
      perform net.http_post(
        url := v_webhook_url,
        body := jsonb_build_object('text', format('[%s] %s: %s', p_severity, p_rule_name, p_message))
      );
    end if;
  exception when others then
    -- Ignore network errors or missing pg_net, don't crash the transaction
  end;
end;
$$;

-- 4. Actual pg_cron job to check alerts (e.g., ticket pool)
-- Checking if ticket pool < 100
create or replace function public.check_system_health()
returns void
language plpgsql
security definer
as $$
declare
  v_run_id uuid;
  v_pool_count int;
  v_reject_rate numeric;
begin
  -- Start cron run tracking
  insert into public.cron_runs (job_name, status) values ('check_system_health', 'running') returning id into v_run_id;

  begin
    -- Rule 1: Ticket Pool Low
    select count(*) into v_pool_count from public.ticket_pool;
    if v_pool_count < 100 then
      perform public.trigger_alert('ticket_pool_low', 'P1', format('Only %s tickets available in pool!', v_pool_count));
    end if;

    -- Update cron run status
    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
end;
$$;

-- Note: In a real Supabase env, we'd run:
-- SELECT cron.schedule('check_system_health', '*/5 * * * *', $$SELECT public.check_system_health()$$);

/* -----------------------------------------------------------------------------
   [3/43] File: 20260910000004_stats_epoch.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000004_stats_epoch.sql
-- ==============================================================================

-- 1. Add stats_epoch to profiles
alter table public.profiles
add column if not exists stats_epoch timestamptz default '2000-01-01 00:00:00Z';

-- Update existing profiles to a safe default
update public.profiles
set stats_epoch = '2000-01-01 00:00:00Z'
where stats_epoch is null;

-- 2. Create RPC for Admin Reset that uses stats_epoch
create or replace function public.admin_reset_stats(p_target uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Require admin AAL2
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set
    total_xp = 0,
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    stats_epoch = now() -- The critical addition
  where id = p_target;

  insert into public.admin_audit (actor_id, action, target_id, context, request_id)
  values (auth.uid(), 'admin.reset', p_target, '{}'::jsonb, null);
end;
$$;

-- 3. Update get_abandoned_guests to use stats_epoch
CREATE OR REPLACE FUNCTION public.get_abandoned_guests()
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id 
  FROM public.profiles p
  WHERE p.role = 'guest'
    AND p.created_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.training_sessions t 
      WHERE t.user_id = p.id 
        AND t.created_at > coalesce(p.stats_epoch, '1970-01-01'::timestamptz)
    );
$$;

/* -----------------------------------------------------------------------------
   [4/43] File: 20260910000005_drop_http_metrics_raw.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000005_drop_http_metrics_raw.sql
-- ==============================================================================

-- 1. Add buckets to http_metrics_minute
alter table public.http_metrics_minute
add column if not exists le_100 integer default 0,
add column if not exists le_300 integer default 0,
add column if not exists le_500 integer default 0,
add column if not exists le_800 integer default 0,
add column if not exists le_2000 integer default 0;

-- 2. Restore record_http_metric to use http_metrics_minute with buckets
CREATE OR REPLACE FUNCTION public.record_http_metric(
  p_path text,
  p_status_code integer,
  p_latency integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamp with time zone;
BEGIN
  -- Lam tron ve phut hien tai
  v_window_start := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  
  INSERT INTO public.http_metrics_minute (
    window_start, path, status_code, request_count, latency_sum,
    le_100, le_300, le_500, le_800, le_2000
  )
  VALUES (
    v_window_start, p_path, p_status_code, 1, p_latency,
    case when p_latency <= 100 then 1 else 0 end,
    case when p_latency <= 300 then 1 else 0 end,
    case when p_latency <= 500 then 1 else 0 end,
    case when p_latency <= 800 then 1 else 0 end,
    case when p_latency <= 2000 then 1 else 0 end
  )
  ON CONFLICT (window_start, path, status_code)
  DO UPDATE SET 
    request_count = http_metrics_minute.request_count + 1,
    latency_sum = http_metrics_minute.latency_sum + p_latency,
    le_100 = http_metrics_minute.le_100 + case when p_latency <= 100 then 1 else 0 end,
    le_300 = http_metrics_minute.le_300 + case when p_latency <= 300 then 1 else 0 end,
    le_500 = http_metrics_minute.le_500 + case when p_latency <= 500 then 1 else 0 end,
    le_800 = http_metrics_minute.le_800 + case when p_latency <= 800 then 1 else 0 end,
    le_2000 = http_metrics_minute.le_2000 + case when p_latency <= 2000 then 1 else 0 end;
END;
$$;

-- 3. Unschedule cleanup job and drop raw table
SELECT cron.unschedule('cleanup_http_metrics_raw');
DROP TABLE IF EXISTS public.http_metrics_raw;

/* -----------------------------------------------------------------------------
   [5/43] File: 20260910000006_ticket_pool_jobs.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000006_ticket_pool_jobs.sql
-- ==============================================================================

-- 1. Cron job to top-up ticket pool
create or replace function public.top_up_ticket_pool()
returns void
language plpgsql
security definer
as $$
declare
  v_pool_count int;
  v_needed int;
begin
  select count(*) into v_pool_count from public.ticket_pool;
  v_needed := 2000 - v_pool_count;
  
  if v_needed > 0 then
    insert into public.ticket_pool (id)
    select gen_random_uuid() from generate_series(1, v_needed);
  end if;
end;
$$;

-- 2. Cron job to reclaim abandoned tickets (> 3 hours old)
create or replace function public.reclaim_abandoned_tickets()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete unused round_tickets that have expired
  delete from public.round_tickets
  where (status = 'unused' or status = 'abandoned')
    and expires_at < now() - interval '3 hours';
end;
$$;

-- Note: 
-- SELECT cron.schedule('top_up_ticket_pool', '*/5 * * * *', $$SELECT public.top_up_ticket_pool()$$);
-- SELECT cron.schedule('reclaim_abandoned_tickets', '0 * * * *', $$SELECT public.reclaim_abandoned_tickets()$$);

/* -----------------------------------------------------------------------------
   [6/43] File: 20260910000007_reject_rate.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000007_reject_rate.sql
-- ==============================================================================

-- 1. Add columns to cheat_flags
alter table public.cheat_flags
add column if not exists round_id uuid,
add column if not exists review_status text not null default 'pending';

-- Add constraints
alter table public.cheat_flags drop constraint if exists cheat_flags_review_status_check;
alter table public.cheat_flags
add constraint cheat_flags_review_status_check
check (review_status in ('pending', 'confirmed', 'false_positive'));

-- 2. Update record_cheat_flag to include round_id
create or replace function public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_severity text default 'soft',
  p_details jsonb default '{}'::jsonb,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_penalty integer;
  v_trust integer;
  v_flagged boolean;
begin
  if p_severity not in ('soft', 'hard') then
    raise exception 'Invalid severity';
  end if;

  insert into public.cheat_flags(user_id, game, reason, severity, details, round_id)
  values (p_user_id, nullif(p_game, ''), p_reason, p_severity,
          coalesce(p_details, '{}'::jsonb), p_round_id);

  v_penalty := case when p_severity = 'hard' then 25 else 8 end;

  update public.profiles
  set trust_score = greatest(0, trust_score - v_penalty)
  where id = p_user_id
  returning trust_score into v_trust;

  v_flagged := v_trust = 0;

  if v_flagged then
    update public.profiles
    set flagged = true,
        flag_reason = p_reason
    where id = p_user_id and flagged = false;
  end if;

  return json_build_object(
    'trust_score', v_trust,
    'flagged', v_flagged,
    'penalty', v_penalty
  );
end;
$$;

-- 3. Update get_cheat_flags RPC
drop function if exists public.get_cheat_flags(integer);
create or replace function public.get_cheat_flags(p_limit integer default 50)
returns table(
  id uuid,
  user_id uuid,
  username text,
  game text,
  reason text,
  severity text,
  details jsonb,
  trust_score integer,
  flagged boolean,
  created_at timestamptz,
  round_id uuid,
  review_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  return query
  select
    f.id, f.user_id, p.username, f.game, f.reason, f.severity, f.details,
    p.trust_score, p.flagged, f.created_at, f.round_id, f.review_status
  from public.cheat_flags f
  left join public.profiles p on p.id = f.user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_cheat_flags(integer) from public, anon;
grant execute on function public.get_cheat_flags(integer) to authenticated;

/* -----------------------------------------------------------------------------
   [7/43] File: 20260910000009_phase10_xp_inflation_quests.sql
   ----------------------------------------------------------------------------- */

-- 20260910000009_phase10_xp_inflation_quests.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. Epoch-aware uniqueness for achievements
ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS epoch timestamptz NOT NULL DEFAULT '-infinity',
  DROP CONSTRAINT IF EXISTS user_achievements_pkey CASCADE,
  ADD PRIMARY KEY (user_id, code, epoch);

-- Update sync_achievements_for to use the current stats_epoch
CREATE OR REPLACE FUNCTION public.sync_achievements_for(p_user uuid)
RETURNS TABLE (code text, unlocked_at timestamptz, newly_unlocked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := p_user;
  v jsonb;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
  v_epoch timestamptz;
  n_rounds bigint;
  n_streak integer;
  n_level integer;
  n_days bigint;
  n_maxax integer;
  n_minax integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT stats_epoch INTO v_epoch FROM public.profiles WHERE id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v := public.achievement_stats(v_user);

  n_rounds := (v->>'rounds')::bigint;
  n_streak := (v->>'streak')::int;
  n_level  := (v->>'level')::int;
  n_days   := (v->>'days')::bigint;
  n_maxax  := (v->>'max_axis')::int;
  n_minax  := (v->>'min_axis')::int;

  -- volume
  IF n_rounds >= 1    THEN v_new := v_new || 'first_round'::text; END IF;
  IF n_rounds >= 10   THEN v_new := v_new || 'rounds_10'::text;   END IF;
  IF n_rounds >= 50   THEN v_new := v_new || 'rounds_50'::text;   END IF;
  IF n_rounds >= 100  THEN v_new := v_new || 'rounds_100'::text;  END IF;
  IF n_rounds >= 250  THEN v_new := v_new || 'rounds_250'::text;  END IF;
  IF n_rounds >= 500  THEN v_new := v_new || 'rounds_500'::text;  END IF;
  IF n_rounds >= 1000 THEN v_new := v_new || 'rounds_1000'::text; END IF;

  -- streak
  IF n_streak >= 3   THEN v_new := v_new || 'streak_3'::text;   END IF;
  IF n_streak >= 7   THEN v_new := v_new || 'streak_7'::text;   END IF;
  IF n_streak >= 14  THEN v_new := v_new || 'streak_14'::text;  END IF;
  IF n_streak >= 30  THEN v_new := v_new || 'streak_30'::text;  END IF;
  IF n_streak >= 60  THEN v_new := v_new || 'streak_60'::text;  END IF;
  IF n_streak >= 100 THEN v_new := v_new || 'streak_100'::text; END IF;
  IF n_days   >= 60  THEN v_new := v_new || 'days_60'::text;    END IF;

  -- level / xp
  IF n_level >= 5  THEN v_new := v_new || 'level_5'::text;  END IF;
  IF n_level >= 10 THEN v_new := v_new || 'level_10'::text; END IF;
  IF n_level >= 20 THEN v_new := v_new || 'level_20'::text; END IF;
  IF n_level >= 30 THEN v_new := v_new || 'level_30'::text; END IF;
  IF n_level >= 50 THEN v_new := v_new || 'level_50'::text; END IF;
  IF (v->>'total_xp')::bigint >= 10000 THEN v_new := v_new || 'xp_10000'::text; END IF;

  -- mastery
  IF n_maxax >= 500 THEN v_new := v_new || 'axis_500'::text; END IF;
  IF n_maxax >= 800 THEN v_new := v_new || 'axis_800'::text; END IF;
  IF n_maxax >= 900 THEN v_new := v_new || 'axis_900'::text; END IF;
  IF n_maxax >= 950 THEN v_new := v_new || 'axis_950'::text; END IF;
  IF n_minax >= 500 THEN v_new := v_new || 'all_axes_500'::text; END IF;
  IF n_minax >= 700 THEN v_new := v_new || 'all_axes_700'::text; END IF;
  IF n_minax >= 850 THEN v_new := v_new || 'all_axes_850'::text; END IF;

  -- breadth (9 game)
  IF (v->>'games')::int     >= 9 THEN v_new := v_new || 'all_games'::text;     END IF;
  IF (v->>'games_10')::int  >= 9 THEN v_new := v_new || 'all_games_10'::text;  END IF;
  IF (v->>'games_600')::int >= 9 THEN v_new := v_new || 'all_games_600'::text; END IF;

  -- score
  IF (v->>'best')::int >= 900 THEN v_new := v_new || 'score_900'::text; END IF;
  IF (v->>'best')::int >= 950 THEN v_new := v_new || 'score_950'::text; END IF;
  IF (v->>'best')::int >= 990 THEN v_new := v_new || 'score_990'::text; END IF;
  IF (v->>'perfect')::int >= 10 THEN v_new := v_new || 'perfect_10'::text; END IF;

  -- per game
  IF (v->>'b_schulte')::int  >= 700 THEN v_new := v_new || 'schulte_700'::text;  END IF;
  IF (v->>'b_schulte')::int  >= 900 THEN v_new := v_new || 'schulte_900'::text;  END IF;
  IF (v->>'b_sudoku')::int   >= 700 THEN v_new := v_new || 'sudoku_700'::text;   END IF;
  IF (v->>'b_sudoku')::int   >= 900 THEN v_new := v_new || 'sudoku_900'::text;   END IF;
  IF (v->>'b_stroop')::int   >= 700 THEN v_new := v_new || 'stroop_700'::text;   END IF;
  IF (v->>'b_stroop')::int   >= 900 THEN v_new := v_new || 'stroop_900'::text;   END IF;
  IF (v->>'b_reaction')::int >= 700 THEN v_new := v_new || 'reaction_700'::text; END IF;
  IF (v->>'b_reaction')::int >= 900 THEN v_new := v_new || 'reaction_900'::text; END IF;
  IF (v->>'b_memory')::int   >= 700 THEN v_new := v_new || 'memory_700'::text;   END IF;
  IF (v->>'b_memory')::int   >= 900 THEN v_new := v_new || 'memory_900'::text;   END IF;
  IF (v->>'b_nback')::int    >= 700 THEN v_new := v_new || 'nback_ace'::text;    END IF;
  IF (v->>'b_nback')::int    >= 900 THEN v_new := v_new || 'nback_900'::text;    END IF;
  IF (v->>'b_math')::int     >= 700 THEN v_new := v_new || 'math_700'::text;     END IF;
  IF (v->>'b_math')::int     >= 900 THEN v_new := v_new || 'math_900'::text;     END IF;
  IF (v->>'b_gonogo')::int   >= 700 THEN v_new := v_new || 'gonogo_700'::text;   END IF;
  IF (v->>'b_gonogo')::int   >= 900 THEN v_new := v_new || 'gonogo_900'::text;   END IF;
  IF (v->>'b_mental')::int   >= 700 THEN v_new := v_new || 'mental_700'::text;   END IF;
  IF (v->>'b_mental')::int   >= 900 THEN v_new := v_new || 'mental_900'::text;   END IF;

  -- dac biet
  IF (v->>'schulte_6x6')::boolean    THEN v_new := v_new || 'schulte_6x6'::text;    END IF;
  IF (v->>'sudoku_extreme')::boolean THEN v_new := v_new || 'sudoku_extreme'::text; END IF;
  IF (v->>'nback_deep')::boolean     THEN v_new := v_new || 'nback_deep'::text;     END IF;

  FOREACH v_code IN ARRAY v_new LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.user_achievements a
      WHERE a.user_id = v_user AND a.code = v_code AND a.epoch = COALESCE(v_epoch, '-infinity')
    ) THEN
      INSERT INTO public.user_achievements(user_id, code, epoch) VALUES (v_user, v_code, COALESCE(v_epoch, '-infinity'));
      v_xp := least(greatest(coalesce(public.achievement_xp(v_code), 0), 0), 1000);
      IF v_xp > 0 THEN
        INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key)
        VALUES (v_user, 'achievement', 0, v_xp, 'achievement_' || v_code);
        UPDATE public.profiles SET total_xp = coalesce(total_xp,0) + v_xp
        WHERE id = v_user;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT a.code, a.unlocked_at, (a.unlocked_at > now() - interval '10 seconds')
    FROM public.user_achievements a
    WHERE a.user_id = v_user AND a.epoch = COALESCE(v_epoch, '-infinity')
    ORDER BY a.unlocked_at DESC;
END;
$$;

-- 2. Chốt MỘT bảng quest duy nhất
CREATE TABLE IF NOT EXISTS public.user_quests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  progress int NOT NULL DEFAULT 0,
  period_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, code, period_key)
);

ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_quests_select_own ON public.user_quests;
CREATE POLICY user_quests_select_own ON public.user_quests FOR SELECT USING (auth.uid() = user_id);

DROP TABLE IF EXISTS public.quest_claims CASCADE;

-- 3. Redefine claim_quest to use user_quests
CREATE OR REPLACE FUNCTION public.claim_quest(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_week date := date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_period text;
  v_row record;
  v_xp integer;
  v_total bigint;
  v_inserted text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_period := CASE WHEN left(p_code, 2) = 'w_' THEN v_week::text ELSE v_today::text END;
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text || ':quest'));

  SELECT * INTO v_row
  FROM public.get_daily_quests() q
  WHERE q.code = p_code;

  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive quest'; END IF;
  IF v_row.claimed THEN RAISE EXCEPTION 'Quest already claimed'; END IF;
  IF v_row.progress < v_row.goal THEN RAISE EXCEPTION 'Quest not completed'; END IF;

  v_xp := public.quest_xp(p_code);
  IF v_xp <= 0 THEN RAISE EXCEPTION 'Quest reward is not configured'; END IF;

  INSERT INTO public.user_quests(user_id, period_key, code, claimed, progress)
  VALUES (v_user, v_period, p_code, true, v_row.progress)
  ON CONFLICT (user_id, code, period_key) DO UPDATE SET claimed = true, progress = EXCLUDED.progress
  RETURNING code INTO v_inserted;

  IF v_inserted IS NULL THEN RAISE EXCEPTION 'Quest already claimed'; END IF;

  INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key)
  VALUES (v_user, 'quest', 0, v_xp);

  UPDATE public.profiles
  SET total_xp = coalesce(total_xp, 0) + v_xp
  WHERE id = v_user
  RETURNING total_xp INTO v_total;

  IF v_total IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  RETURN jsonb_build_object(
    'code', p_code,
    'xpAwarded', v_xp,
    'totalXp', v_total
  );
END;
$$;

-- 4. Redefine get_daily_quests to use user_quests instead of quest_claims
CREATE OR REPLACE FUNCTION public.get_daily_quests()
RETURNS TABLE (
  code text,
  progress integer,
  goal integer,
  xp_reward integer,
  claimed boolean,
  title_vi text,
  title_en text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
      date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_start
  ),
  seed AS (
    SELECT (today - date '2020-01-01')::integer AS n FROM clock
  ),
  p AS (
    SELECT stats_epoch FROM public.profiles WHERE id = auth.uid()
  ),
  daily AS (
    SELECT s.*
    FROM public.training_sessions s, clock c, p
    WHERE s.user_id = auth.uid()
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = c.today
      AND s.created_at >= p.stats_epoch
  ),
  weekly AS (
    SELECT s.*
    FROM public.training_sessions s, clock c, p
    WHERE s.user_id = auth.uid()
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= c.week_start
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < c.week_start + 7
      AND s.created_at >= p.stats_epoch
  ),
  daily_agg AS (
    SELECT
      (SELECT count(*) FROM daily)::integer AS rounds,
      (SELECT count(*) FROM daily WHERE round_score >= 600)::integer AS score_600,
      (SELECT count(*) FROM daily WHERE round_score >= 750)::integer AS score_750,
      (SELECT count(*) FROM daily WHERE round_score >= 850)::integer AS score_850,
      (SELECT count(DISTINCT game) FROM daily)::integer AS games
  ),
  weekly_agg AS (
    SELECT
      (SELECT count(*) FROM weekly)::integer AS rounds,
      (SELECT count(DISTINCT game) FROM weekly)::integer AS games,
      (SELECT count(*) FROM weekly WHERE round_score >= 800)::integer AS score_800,
      (SELECT count(*) FROM weekly WHERE round_score >= 900)::integer AS score_900
  ),
  daily_volume(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n, 3)
        WHEN 0 THEN 'q_rounds_3'
        WHEN 1 THEN 'q_rounds_5'
        ELSE 'q_rounds_7'
      END,
      daily_agg.rounds,
      CASE mod(seed.n, 3) WHEN 0 THEN 3 WHEN 1 THEN 5 ELSE 7 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_quality(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN 'q_score_600'
        WHEN 1 THEN 'q_score_750_2'
        ELSE 'q_score_850'
      END,
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN daily_agg.score_600
        WHEN 1 THEN daily_agg.score_750
        ELSE daily_agg.score_850
      END,
      CASE mod(seed.n + 1, 3) WHEN 1 THEN 2 ELSE 1 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_variety(code, raw_progress, goal) AS (
    SELECT
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3)
            WHEN 0 THEN 'q_games_2'
            WHEN 1 THEN 'q_games_3'
            ELSE 'q_games_4'
          END
        ELSE (ARRAY[
          'q_play_schulte_2','q_play_sudoku_2','q_play_stroop_2',
          'q_play_reaction_2','q_play_memory_2','q_play_nback_2',
          'q_play_math_2','q_play_gonogo_2','q_play_mental_2',
          'q_play_corsi_2','q_play_trail_2'
        ])[mod(seed.n, 11) + 1]
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN daily_agg.games
        ELSE (
          SELECT count(*)::integer
          FROM daily d
          WHERE d.game = (ARRAY[
            'schulte','sudoku','stroop','reaction','memory',
            'nback','math','gonogo','mental','corsi','trail'
          ])[mod(seed.n, 11) + 1]
        )
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3) WHEN 0 THEN 2 WHEN 1 THEN 3 ELSE 4 END
        ELSE 2
      END
    FROM seed CROSS JOIN daily_agg
  ),
  weekly_choice AS (
    SELECT mod(((clock.week_start - date '2020-01-06') / 7), 2) AS variant
    FROM clock
  ),
  weekly_defs(code, raw_progress, goal) AS (
    SELECT 'w_rounds_25', weekly_agg.rounds, 25 FROM weekly_agg
    UNION ALL
    SELECT 'w_games_7', weekly_agg.games, 7 FROM weekly_agg
    UNION ALL
    SELECT
      CASE WHEN weekly_choice.variant = 0 THEN 'w_score_800_5' ELSE 'w_score_900_3' END,
      CASE WHEN weekly_choice.variant = 0 THEN weekly_agg.score_800 ELSE weekly_agg.score_900 END,
      CASE WHEN weekly_choice.variant = 0 THEN 5 ELSE 3 END
    FROM weekly_agg CROSS JOIN weekly_choice
  ),
  defs(code, raw_progress, goal, period_key, sort_order) AS (
    SELECT code, raw_progress, goal, clock.today, 1 FROM daily_volume CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 2 FROM daily_quality CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 3 FROM daily_variety CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.week_start, 10 FROM weekly_defs CROSS JOIN clock
  )
  SELECT
    d.code::text,
    least(greatest(d.raw_progress, 0), d.goal)::integer,
    d.goal::integer,
    public.quest_xp(d.code)::integer,
    EXISTS (
      SELECT 1
      FROM public.user_quests c
      WHERE c.user_id = auth.uid()
        AND c.code = d.code
        AND c.period_key = d.period_key::text
        AND c.claimed = true
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  FROM defs d
  ORDER BY d.sort_order, d.code;
$$;

/* -----------------------------------------------------------------------------
   [8/43] File: 20260910000010_phase10_admin_audit_immutable.sql
   ----------------------------------------------------------------------------- */

-- 20260910000010_phase10_admin_audit_immutable.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. admin_audit True Append-Only
CREATE OR REPLACE FUNCTION public.admin_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit is immutable and append-only. Use DROP PARTITION for retention.';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_no_mutate ON public.admin_audit;
CREATE TRIGGER admin_audit_no_mutate
BEFORE UPDATE OR DELETE ON public.admin_audit
FOR EACH ROW EXECUTE FUNCTION public.admin_audit_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit FROM anon, authenticated, service_role;

-- 2. admin_reset_profile RPC for atomicity
CREATE OR REPLACE FUNCTION public.admin_reset_profile(
  p_target uuid,
  p_actor uuid,
  p_request_id text,
  p_patch jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access denied';
  END IF;

  UPDATE public.profiles
  SET 
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record),
    total_xp = COALESCE((p_patch->>'total_xp')::int, total_xp),
    last_active_date = NULL,
    stats_epoch = (p_patch->>'stats_epoch')::timestamptz,
    schulte_sessions = COALESCE((p_patch->>'schulte_sessions')::int, schulte_sessions),
    sudoku_sessions = COALESCE((p_patch->>'sudoku_sessions')::int, sudoku_sessions),
    stroop_sessions = COALESCE((p_patch->>'stroop_sessions')::int, stroop_sessions),
    reaction_sessions = COALESCE((p_patch->>'reaction_sessions')::int, reaction_sessions),
    memory_sessions = COALESCE((p_patch->>'memory_sessions')::int, memory_sessions),
    nback_sessions = COALESCE((p_patch->>'nback_sessions')::int, nback_sessions),
    math_sessions = COALESCE((p_patch->>'math_sessions')::int, math_sessions),
    gonogo_sessions = COALESCE((p_patch->>'gonogo_sessions')::int, gonogo_sessions),
    mental_sessions = COALESCE((p_patch->>'mental_sessions')::int, mental_sessions),
    corsi_sessions = COALESCE((p_patch->>'corsi_sessions')::int, corsi_sessions),
    trail_sessions = COALESCE((p_patch->>'trail_sessions')::int, trail_sessions)
  WHERE id = p_target
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset', '{}'::jsonb, COALESCE(p_request_id, ''));

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_profile(uuid, uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_profile(uuid, uuid, text, jsonb) TO service_role;

/* -----------------------------------------------------------------------------
   [9/43] File: 20260911000000_phase11_offline_sync_columns.sql
   ----------------------------------------------------------------------------- */

-- 20260911000000_phase11_offline_sync_columns.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. Add columns to training_sessions
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'online';

-- 2. Update submit_round_transaction to accept occurred_at and provenance
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer);
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer);
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version text default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
BEGIN
  IF p_game NOT IN ('schulte','sudoku','stroop','reaction','memory','nback','math','gonogo','mental','corsi','trail','search') THEN
    RAISE EXCEPTION 'Invalid game';
  END IF;
  IF p_round_score < 0 OR p_round_score > 1000 THEN
    RAISE EXCEPTION 'Invalid round score';
  END IF;

  SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.user_id <> p_user_id OR v_ticket.game <> p_game THEN
    RAISE EXCEPTION 'Invalid round ticket';
  END IF;
  IF v_ticket.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Round already submitted'; END IF;
  IF v_ticket.expires_at < now() THEN RAISE EXCEPTION 'Round ticket expired'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT count(*)::integer INTO v_recent
  FROM public.training_sessions s
  WHERE s.user_id = p_user_id AND s.created_at > now() - interval '1 hour';

  IF v_recent >= 40 THEN
    PERFORM public.record_cheat_flag(
      p_user_id, p_game, 'Nộp quá nhiều ván trong một giờ', 'hard',
      jsonb_build_object('roundsLastHour', v_recent)
    );
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  v_idle := public.idle_days_vn(v_profile.last_active_date);

  v_base_speed   := public.decay_rating(coalesce(v_profile.speed_score, 0),           v_idle);
  v_base_focus   := public.decay_rating(coalesce(v_profile.focus_score, 0),           v_idle);
  v_base_spatial := public.decay_rating(coalesce(v_profile.cfop_spatial_record, 0),   v_idle);
  v_base_logic   := public.decay_rating(coalesce(v_profile.algebraic_logic_score, 0), v_idle);
  v_base_memory  := public.decay_rating(coalesce(v_profile.memory_score, 0),          v_idle);

  v_speed   := CASE WHEN p_axes ? 'speed'   THEN public.apply_round_rating(v_base_speed,   (p_axes->>'speed')::integer)   ELSE v_base_speed END;
  v_focus   := CASE WHEN p_axes ? 'focus'   THEN public.apply_round_rating(v_base_focus,   (p_axes->>'focus')::integer)   ELSE v_base_focus END;
  v_spatial := CASE WHEN p_axes ? 'spatial' THEN public.apply_round_rating(v_base_spatial, (p_axes->>'spatial')::integer) ELSE v_base_spatial END;
  v_logic   := CASE WHEN p_axes ? 'logic'   THEN public.apply_round_rating(v_base_logic,   (p_axes->>'logic')::integer)   ELSE v_base_logic END;
  v_memory  := CASE WHEN p_axes ? 'memory'  THEN public.apply_round_rating(v_base_memory,  (p_axes->>'memory')::integer)  ELSE v_base_memory END;

  v_streak := CASE
    WHEN v_profile.last_active_date = v_today THEN coalesce(v_profile.synapse_streak, 0)
    WHEN v_profile.last_active_date = v_today - 1 THEN coalesce(v_profile.synapse_streak, 0) + 1
    ELSE 1
  END;

  SELECT coalesce(sum(xp_awarded), 0)::integer INTO v_today_xp
  FROM public.xp_events
  WHERE user_id = p_user_id
    AND created_at >= (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh')
    AND created_at <  ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');

  v_xp := greatest(0, least(100, round(p_round_score / 10.0)::integer));
  IF coalesce(v_profile.flagged, false) THEN
    v_xp := 0;
  ELSIF v_today_xp + v_xp > 500 THEN
    v_xp := greatest(0, 500 - v_today_xp);
  END IF;

  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded)
    VALUES (p_user_id, p_game, p_round_score, v_xp);
  END IF;

  INSERT INTO public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance
  ) VALUES (
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance
  );

  UPDATE public.profiles SET
    speed_score = v_speed,
    focus_score = v_focus,
    cfop_spatial_record = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions  = schulte_sessions  + CASE WHEN p_game='schulte'  THEN 1 ELSE 0 END,
    sudoku_sessions   = sudoku_sessions   + CASE WHEN p_game='sudoku'   THEN 1 ELSE 0 END,
    stroop_sessions   = stroop_sessions   + CASE WHEN p_game='stroop'   THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game='reaction' THEN 1 ELSE 0 END,
    memory_sessions   = memory_sessions   + CASE WHEN p_game='memory'   THEN 1 ELSE 0 END,
    nback_sessions    = nback_sessions    + CASE WHEN p_game='nback'    THEN 1 ELSE 0 END,
    math_sessions     = math_sessions     + CASE WHEN p_game='math'     THEN 1 ELSE 0 END,
    gonogo_sessions   = gonogo_sessions   + CASE WHEN p_game='gonogo'   THEN 1 ELSE 0 END,
    mental_sessions   = mental_sessions   + CASE WHEN p_game='mental'   THEN 1 ELSE 0 END,
    corsi_sessions    = corsi_sessions    + CASE WHEN p_game='corsi'    THEN 1 ELSE 0 END,
    trail_sessions    = trail_sessions    + CASE WHEN p_game='trail'    THEN 1 ELSE 0 END,
    search_sessions   = coalesce(search_sessions, 0) + CASE WHEN p_game='search'   THEN 1 ELSE 0 END,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  UPDATE public.round_tickets SET submitted_at = now() WHERE id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  RETURN jsonb_build_object(
    'profile',     to_jsonb(v_profile),
    'xpAwarded',   v_xp,
    'totalXp',     v_profile.total_xp,
    'level',       v_new_level,
    'leveledUp',   v_new_level > v_old_level,
    'decayedDays', v_idle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text)
  TO service_role;

-- 3. Update get_daily_quests to rely on recorded_at
CREATE OR REPLACE FUNCTION public.get_daily_quests()
RETURNS TABLE (
  code text,
  progress integer,
  goal integer,
  xp_reward integer,
  claimed boolean,
  title_vi text,
  title_en text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
      date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_start
  ),
  seed AS (
    SELECT (today - date '2020-01-01')::integer AS n FROM clock
  ),
  p AS (
    SELECT stats_epoch FROM public.profiles WHERE id = auth.uid()
  ),
  -- Lọc 20 ván offline_sync sớm nhất trong ngày
  -- cùng với toàn bộ ván online
  valid_sessions AS (
    SELECT * FROM (
      SELECT s.*, 
        row_number() OVER (PARTITION BY (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, s.provenance ORDER BY s.recorded_at ASC) as offline_rank
      FROM public.training_sessions s, p
      WHERE s.user_id = auth.uid()
        AND s.recorded_at >= p.stats_epoch
    ) q
    WHERE provenance = 'online' OR (provenance = 'offline_sync' AND offline_rank <= 20)
  ),
  daily AS (
    SELECT s.*
    FROM valid_sessions s, clock c
    WHERE (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = c.today
  ),
  weekly AS (
    SELECT s.*
    FROM valid_sessions s, clock c
    WHERE (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= c.week_start
      AND (s.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < c.week_start + 7
  ),
  daily_agg AS (
    SELECT
      (SELECT count(*) FROM daily)::integer AS rounds,
      (SELECT count(*) FROM daily WHERE round_score >= 600)::integer AS score_600,
      (SELECT count(*) FROM daily WHERE round_score >= 750)::integer AS score_750,
      (SELECT count(*) FROM daily WHERE round_score >= 850)::integer AS score_850,
      (SELECT count(DISTINCT game) FROM daily)::integer AS games
  ),
  weekly_agg AS (
    SELECT
      (SELECT count(*) FROM weekly)::integer AS rounds,
      (SELECT count(DISTINCT game) FROM weekly)::integer AS games,
      (SELECT count(*) FROM weekly WHERE round_score >= 800)::integer AS score_800,
      (SELECT count(*) FROM weekly WHERE round_score >= 900)::integer AS score_900
  ),
  daily_volume(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n, 3)
        WHEN 0 THEN 'q_rounds_3'
        WHEN 1 THEN 'q_rounds_5'
        ELSE 'q_rounds_7'
      END,
      daily_agg.rounds,
      CASE mod(seed.n, 3) WHEN 0 THEN 3 WHEN 1 THEN 5 ELSE 7 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_quality(code, raw_progress, goal) AS (
    SELECT
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN 'q_score_600'
        WHEN 1 THEN 'q_score_750_2'
        ELSE 'q_score_850'
      END,
      CASE mod(seed.n + 1, 3)
        WHEN 0 THEN daily_agg.score_600
        WHEN 1 THEN daily_agg.score_750
        ELSE daily_agg.score_850
      END,
      CASE mod(seed.n + 1, 3) WHEN 1 THEN 2 ELSE 1 END
    FROM seed CROSS JOIN daily_agg
  ),
  daily_variety(code, raw_progress, goal) AS (
    SELECT
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3)
            WHEN 0 THEN 'q_games_2'
            WHEN 1 THEN 'q_games_3'
            ELSE 'q_games_4'
          END
        ELSE (ARRAY[
          'q_play_schulte_2','q_play_sudoku_2','q_play_stroop_2',
          'q_play_reaction_2','q_play_memory_2','q_play_nback_2',
          'q_play_math_2','q_play_gonogo_2','q_play_mental_2',
          'q_play_corsi_2','q_play_trail_2'
        ])[mod(seed.n, 11) + 1]
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN daily_agg.games
        ELSE (
          SELECT count(*)::integer
          FROM daily d
          WHERE d.game = (ARRAY[
            'schulte','sudoku','stroop','reaction','memory',
            'nback','math','gonogo','mental','corsi','trail'
          ])[mod(seed.n, 11) + 1]
        )
      END,
      CASE
        WHEN mod(seed.n, 2) = 0 THEN
          CASE mod(seed.n, 3) WHEN 0 THEN 2 WHEN 1 THEN 3 ELSE 4 END
        ELSE 2
      END
    FROM seed CROSS JOIN daily_agg
  ),
  weekly_choice AS (
    SELECT mod(((clock.week_start - date '2020-01-06') / 7), 2) AS variant
    FROM clock
  ),
  weekly_defs(code, raw_progress, goal) AS (
    SELECT 'w_rounds_25', weekly_agg.rounds, 25 FROM weekly_agg
    UNION ALL
    SELECT 'w_games_7', weekly_agg.games, 7 FROM weekly_agg
    UNION ALL
    SELECT
      CASE WHEN weekly_choice.variant = 0 THEN 'w_score_800_5' ELSE 'w_score_900_3' END,
      CASE WHEN weekly_choice.variant = 0 THEN weekly_agg.score_800 ELSE weekly_agg.score_900 END,
      CASE WHEN weekly_choice.variant = 0 THEN 5 ELSE 3 END
    FROM weekly_agg CROSS JOIN weekly_choice
  ),
  defs(code, raw_progress, goal, period_key, sort_order) AS (
    SELECT code, raw_progress, goal, clock.today, 1 FROM daily_volume CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 2 FROM daily_quality CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.today, 3 FROM daily_variety CROSS JOIN clock
    UNION ALL
    SELECT code, raw_progress, goal, clock.week_start, 10 FROM weekly_defs CROSS JOIN clock
  )
  SELECT
    d.code::text,
    least(greatest(d.raw_progress, 0), d.goal)::integer,
    d.goal::integer,
    public.quest_xp(d.code)::integer,
    EXISTS (
      SELECT 1
      FROM public.user_quests c
      WHERE c.user_id = auth.uid()
        AND c.code = d.code
        AND c.period_key = d.period_key::text
        AND c.claimed = true
    ),
    public.quest_title(d.code, 'vi')::text,
    public.quest_title(d.code, 'en')::text
  FROM defs d
  ORDER BY d.sort_order, d.code;
$$;

/* -----------------------------------------------------------------------------
   [10/43] File: 20260911000001_phase11_observability_fixes.sql
   ----------------------------------------------------------------------------- */

-- 20260911000001_phase11_observability_fixes.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. Add le_inf bucket and backfill
ALTER TABLE public.http_metrics_minute 
  ADD COLUMN IF NOT EXISTS le_inf integer DEFAULT 0;

UPDATE public.http_metrics_minute SET le_inf = request_count WHERE le_inf <> request_count;

ALTER TABLE public.http_metrics_minute
  ADD CONSTRAINT http_metrics_minute_buckets_check 
  CHECK (
    le_100 >= 0 AND
    le_300 >= le_100 AND
    le_500 >= le_300 AND
    le_800 >= le_500 AND
    le_2000 >= le_800 AND
    le_inf >= le_2000 AND
    le_inf = request_count
  );

-- 2. Update record_http_metric
CREATE OR REPLACE FUNCTION public.record_http_metric(
  p_path text,
  p_status_code integer,
  p_latency integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamp with time zone;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  
  INSERT INTO public.http_metrics_minute (
    window_start, path, status_code, request_count, latency_sum,
    le_100, le_300, le_500, le_800, le_2000, le_inf
  )
  VALUES (
    v_window_start, p_path, p_status_code, 1, p_latency,
    case when p_latency <= 100 then 1 else 0 end,
    case when p_latency <= 300 then 1 else 0 end,
    case when p_latency <= 500 then 1 else 0 end,
    case when p_latency <= 800 then 1 else 0 end,
    case when p_latency <= 2000 then 1 else 0 end,
    1
  )
  ON CONFLICT (window_start, path, status_code)
  DO UPDATE SET 
    request_count = http_metrics_minute.request_count + 1,
    latency_sum = http_metrics_minute.latency_sum + p_latency,
    le_100 = http_metrics_minute.le_100 + case when p_latency <= 100 then 1 else 0 end,
    le_300 = http_metrics_minute.le_300 + case when p_latency <= 300 then 1 else 0 end,
    le_500 = http_metrics_minute.le_500 + case when p_latency <= 500 then 1 else 0 end,
    le_800 = http_metrics_minute.le_800 + case when p_latency <= 800 then 1 else 0 end,
    le_2000 = http_metrics_minute.le_2000 + case when p_latency <= 2000 then 1 else 0 end,
    le_inf = http_metrics_minute.le_inf + 1;
END;
$$;

/* -----------------------------------------------------------------------------
   [11/43] File: 20260918000000_phase12_xp_ledger.sql
   ----------------------------------------------------------------------------- */

-- 20260918000000_phase12_xp_ledger.sql
-- Áp dụng mô hình Ledger một chiều cho XP

SET lock_timeout = '2s';

-- 1. Thêm các cột peak_rating
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS peak_rating_focus int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_speed int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_memory int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_spatial int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_logic int NOT NULL DEFAULT 0;

-- 2. Trigger auto-bump total_xp từ xp_events
CREATE OR REPLACE FUNCTION public.bump_total_xp() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('gamification.is_xp_trigger', 'true', true);
  UPDATE public.profiles
  SET total_xp = GREATEST(0, coalesce(total_xp, 0) + NEW.xp_awarded)
  WHERE id = NEW.user_id;
  PERFORM set_config('gamification.is_xp_trigger', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_events_apply ON public.xp_events;
CREATE TRIGGER trg_xp_events_apply
AFTER INSERT ON public.xp_events
FOR EACH ROW
EXECUTE FUNCTION public.bump_total_xp();

-- 3. Trigger chặn các RPC cũ cập nhật total_xp trực tiếp
CREATE OR REPLACE FUNCTION public.block_manual_xp_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('gamification.is_xp_trigger', true) IS DISTINCT FROM 'true' THEN
    IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
      NEW.total_xp := OLD.total_xp;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_manual_xp_update ON public.profiles;
CREATE TRIGGER trg_block_manual_xp_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.block_manual_xp_update();

-- 4. Sửa admin_reset_stats để ghi log trừ điểm thay vì set thẳng 0
CREATE OR REPLACE FUNCTION public.admin_reset_stats(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_xp integer;
BEGIN
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_target, 'admin_reset', 0, -v_old_xp);
  END IF;

  update public.profiles
  set
    total_xp = 0, -- Sẽ bị trigger block, nhưng không sao vì trigger xp_events đã trừ về 0
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    stats_epoch = now()
  where id = p_target;

  insert into public.admin_audit (actor_id, action, target_id, context, request_id)
  values (auth.uid(), 'admin.reset', p_target, '{}'::jsonb, null);
END;
$$;

-- 5. Reconcile XP job
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_mismatches int;
BEGIN
  insert into public.cron_runs (job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*) INTO v_mismatches 
    FROM public.profiles p 
    JOIN (SELECT user_id, sum(xp_awarded) s FROM public.xp_events GROUP BY 1) x ON x.user_id = p.id 
    WHERE coalesce(p.total_xp, 0) <> coalesce(x.s, 0);

    IF v_mismatches > 0 THEN
      PERFORM public.trigger_alert('xp_ledger_mismatch', 'P1', format('Found %s users with mismatched XP!', v_mismatches));
    END IF;

    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
END;
$$;

/* -----------------------------------------------------------------------------
   [12/43] File: 20260918000001_phase12_decay_db.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260918000001_phase12_decay_db.sql
-- ==============================================================================

-- 1. Hàm tính effective_rating với decay (hỗ trợ double precision / numeric)
CREATE OR REPLACE FUNCTION public.effective_rating(
  p_current_score double precision,
  p_peak_score integer,
  p_idle_days double precision
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_current double precision := COALESCE(p_current_score, 0);
  v_peak double precision := COALESCE(p_peak_score, 0)::double precision;
  v_idle double precision := GREATEST(COALESCE(p_idle_days, 0), 0);
  v_floor integer;
  v_decay integer;
BEGIN
  -- Không giảm thấp hơn 35% điểm đỉnh
  v_floor := FLOOR(v_peak * 0.35)::integer;

  IF v_current <= v_floor THEN
    RETURN ROUND(v_current)::integer;
  END IF;

  IF v_idle <= 14 THEN
    RETURN ROUND(v_current)::integer;
  END IF;

  -- Từ ngày 15 trở đi giảm 1% mỗi ngày
  v_decay := FLOOR(
    v_current * ((v_idle - 14) * 0.01)
  )::integer;

  RETURN GREATEST(
    v_floor,
    ROUND(v_current - v_decay)::integer
  );
END;
$$;

-- Overload hỗ trợ numeric
CREATE OR REPLACE FUNCTION public.effective_rating(
  p_current_score numeric,
  p_peak_score numeric,
  p_idle_days numeric
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.effective_rating(p_current_score::double precision, p_peak_score::integer, p_idle_days::double precision);
$$;

-- 2. Hàm tính cognitive_index dưới DB
CREATE OR REPLACE FUNCTION public.compute_cognitive_index(
  p_focus int,
  p_speed int,
  p_memory int,
  p_spatial int,
  p_logic int
) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_arr int[] := ARRAY[p_focus, p_speed, p_memory, p_spatial, p_logic];
  v_valid int := 0;
  v_sum int := 0;
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    IF v_arr[i] > 0 THEN
      v_valid := v_valid + 1;
      v_sum := v_sum + v_arr[i];
    END IF;
  END LOOP;
  
  IF v_valid = 0 THEN RETURN 0; END IF;
  
  -- Trung bình cộng nhân với log(1.5 + valid) / log(6.5) để phạt tài khoản ít trục
  RETURN floor((v_sum::float / v_valid) * (ln(1.5 + v_valid) / ln(6.5)));
END;
$$;

-- 3. Cập nhật view cho friend_leaderboard
DROP VIEW IF EXISTS public.friend_leaderboard;
CREATE VIEW public.friend_leaderboard AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  public.compute_cognitive_index(
    public.effective_rating(p.focus_score, p.peak_rating_focus, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.speed_score, p.peak_rating_speed, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.memory_score, p.peak_rating_memory, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision),
    public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, (EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400.0)::double precision)
  ) as cognitive_index
FROM public.profiles p
WHERE p.role = 'user';

/* -----------------------------------------------------------------------------
   [13/43] File: 20260918000002_phase12_age_gate.sql
   ----------------------------------------------------------------------------- */

-- ==============================================================================
-- 20260918000002_phase12_age_gate.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- Thêm constraint kiểm tra tuổi >= 13 cho user
ALTER TABLE public.profiles
ADD CONSTRAINT birth_year_min_age 
CHECK (birth_year IS NULL OR birth_year <= extract(year from now())::int - 13);

/* -----------------------------------------------------------------------------
   [14/43] File: 20260925000000_phase13_ai_audit_part2.sql
   ----------------------------------------------------------------------------- */

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rating_model_version integer NOT NULL DEFAULT 1;

-- ==============================================================================
-- 20260925000000_phase13_ai_audit_part2.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- 1. Redefine admin_grant_tx to write to xp_events and NOT update total_xp directly
CREATE OR REPLACE FUNCTION public.admin_grant_tx(
  p_actor_id uuid,
  p_target_id uuid,
  p_patch jsonb,
  p_context jsonb,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
  v_xp_delta int := 0;
  v_current_xp int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT coalesce(total_xp, 0) INTO v_current_xp FROM public.profiles WHERE id = p_target_id FOR UPDATE;

  IF p_patch ? 'total_xp' THEN
    v_xp_delta := (p_patch->>'total_xp')::int - v_current_xp;
  END IF;

  IF v_xp_delta <> 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_target_id, 'admin_grant', 0, v_xp_delta);
  END IF;

  UPDATE public.profiles
  SET
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record)
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  IF v_xp_delta <> 0 THEN
    PERFORM public.sync_achievements_for(p_target_id);
  END IF;

  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor_id, p_target_id, 'grant', p_context, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;


-- 2. Redefine check_xp_ledger to sum only after stats_epoch
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_mismatches int;
BEGIN
  insert into public.cron_runs (job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*) INTO v_mismatches 
    FROM public.profiles p 
    JOIN (
      SELECT e.user_id, sum(e.xp_awarded) as s 
      FROM public.xp_events e
      JOIN public.profiles p2 ON p2.id = e.user_id
      WHERE e.created_at >= coalesce(p2.stats_epoch, '1970-01-01'::timestamptz)
      GROUP BY 1
    ) x ON x.user_id = p.id 
    WHERE coalesce(p.total_xp, p.level, 0) <> coalesce(x.s, 0);

    IF v_mismatches > 0 THEN
      PERFORM public.trigger_alert('xp_ledger_mismatch', 'P1', format('Found %s users with mismatched XP!', v_mismatches));
    END IF;

    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
END;
$$;


-- 3. Redefine admin_reset_stats to only push stats_epoch (no negative xp)
CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_actor uuid,
  p_target uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('gamification.is_xp_trigger', 'true', true);
  
  UPDATE public.profiles
  SET
    total_xp = 0,
    stats_epoch = now(),
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    synapse_streak = 0
  WHERE id = p_target
  RETURNING * INTO v_new_profile;
  
  PERFORM set_config('gamification.is_xp_trigger', 'false', true);

  -- Delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- Insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset_stats', '{}'::jsonb, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;


-- 4. Create profiles_decayed view as single source of truth for UI
DROP VIEW IF EXISTS public.profiles_decayed CASCADE;
CREATE VIEW public.profiles_decayed AS
SELECT 
  p.id, 
  p.username, 
  p.avatar_url, 
  p.role, 
  p.birth_year, 
  p.total_xp, 
  p.level, 
  p.last_active_date,
  p.schulte_sessions, 
  p.sudoku_sessions, 
  p.stroop_sessions, 
  p.reaction_sessions, 
  p.memory_sessions, 
  p.nback_sessions, 
  p.math_sessions, 
  p.gonogo_sessions, 
  p.mental_sessions, 
  p.corsi_sessions, 
  p.trail_sessions, 
  p.search_sessions, 
  p.created_at, 
  p.synapse_streak, 
  p.peak_rating_logic, 
  p.peak_rating_focus, 
  p.peak_rating_speed, 
  p.peak_rating_memory, 
  p.peak_rating_spatial, 
  p.stats_epoch, 
  p.is_adult, 
  p.rating_model_version, 
  p.flagged,
  public.effective_rating(p.focus_score, p.peak_rating_focus, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as focus_score,
  public.effective_rating(p.speed_score, p.peak_rating_speed, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as speed_score,
  public.effective_rating(p.memory_score, p.peak_rating_memory, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as memory_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as spatial_score,
  public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as algebraic_logic_score,
  public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400) as cfop_spatial_record,
  LEAST(
    ROUND((
      COALESCE(public.effective_rating(p.speed_score, p.peak_rating_speed, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400), 0) +
      COALESCE(public.effective_rating(p.focus_score, p.peak_rating_focus, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400), 0) +
      COALESCE(public.effective_rating(p.algebraic_logic_score, p.peak_rating_logic, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400), 0) +
      COALESCE(public.effective_rating(p.memory_score, p.peak_rating_memory, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400), 0) +
      COALESCE(public.effective_rating(p.cfop_spatial_record, p.peak_rating_spatial, EXTRACT(EPOCH FROM (now() - coalesce(p.last_active_date::timestamptz, p.created_at))) / 86400), 0)
    ) / 5.0)::integer,
    (COALESCE(p.schulte_sessions, 0) + COALESCE(p.sudoku_sessions, 0) + COALESCE(p.stroop_sessions, 0) + COALESCE(p.reaction_sessions, 0) + COALESCE(p.memory_sessions, 0) + COALESCE(p.nback_sessions, 0) + COALESCE(p.math_sessions, 0) + COALESCE(p.gonogo_sessions, 0) + COALESCE(p.mental_sessions, 0) + COALESCE(p.corsi_sessions, 0) + COALESCE(p.trail_sessions, 0) + COALESCE(p.search_sessions, 0)) * 25
  ) as cognitive_index
FROM public.profiles p;

-- Allow authenticated users to query the view
GRANT SELECT ON public.profiles_decayed TO authenticated, service_role, anon;


-- 5. Prometheus-style Latency Metrics for System Alerts
CREATE OR REPLACE FUNCTION public.check_system_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool_size int;
  v_payload jsonb;
  v_total int;
  v_target float;
  v_p95 float;
  b100 int; b500 int; b1000 int; b2000 int; b5000 int;
BEGIN
  -- Interpolate P95 using buckets (Prometheus style) instead of sorting raw data
  SELECT count(*), 
         count(case when latency <= 100 then 1 end),
         count(case when latency <= 500 then 1 end),
         count(case when latency <= 1000 then 1 end),
         count(case when latency <= 2000 then 1 end),
         count(case when latency <= 5000 then 1 end)
  INTO v_total, b100, b500, b1000, b2000, b5000
  FROM public.http_metrics_minute
  WHERE window_start > now() - interval '15 minutes';

  IF v_total = 0 THEN
    v_p95 := 0;
  ELSE
    v_target := v_total * 0.95;
    IF v_target <= b100 THEN
      v_p95 := (v_target / NULLIF(b100, 0)) * 100;
    ELSIF v_target <= b500 THEN
      v_p95 := 100 + ((v_target - b100) / NULLIF(b500 - b100, 0)) * 400;
    ELSIF v_target <= b1000 THEN
      v_p95 := 500 + ((v_target - b500) / NULLIF(b1000 - b500, 0)) * 500;
    ELSIF v_target <= b2000 THEN
      v_p95 := 1000 + ((v_target - b1000) / NULLIF(b2000 - b1000, 0)) * 1000;
    ELSIF v_target <= b5000 THEN
      v_p95 := 2000 + ((v_target - b2000) / NULLIF(b5000 - b2000, 0)) * 3000;
    ELSE
      v_p95 := 5000;
    END IF;
  END IF;

  -- Check ticket pool size
  SELECT count(*) INTO v_pool_size FROM public.ticket_pool;

  IF coalesce(v_p95, 0) > 1000 OR v_pool_size < 500 THEN
    v_payload := jsonb_build_object(
      'message', CASE 
        WHEN v_p95 > 1000 THEN 'P95 Latency exceeded 1000ms!'
        ELSE 'Ticket pool running dangerously low!'
      END,
      'metrics', jsonb_build_object(
        'p95_latency_ms', v_p95,
        'pool_size', v_pool_size
      )
    );
    RAISE WARNING 'SYSTEM ALERT: %', v_payload;
  END IF;
END;
$$;

/* -----------------------------------------------------------------------------
   [15/43] File: 20260926000000_phase15_ai_audit_part3.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260926000000_phase15_ai_audit_part3.sql
-- ==============================================================================

-- 1. P1-14: Age gate constraint (trigger-based to allow dynamic year)
CREATE OR REPLACE FUNCTION public.check_min_age()
RETURNS trigger AS $$
BEGIN
  IF NEW.birth_year IS NOT NULL AND NEW.birth_year > (extract(year from now())::int - 13) THEN
    RAISE EXCEPTION 'User must be at least 13 years old';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_min_age ON public.profiles;
CREATE TRIGGER trg_check_min_age
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_min_age();

-- 2. P2/P3: Exclude guests from public leaderboard
-- We also ensure it queries from profiles_decayed (the new Single Source of Truth)
DROP VIEW IF EXISTS public.public_leaderboard;
CREATE VIEW public.public_leaderboard AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  p.total_xp,
  p.level,
  LEAST(
    ROUND((COALESCE(p.speed_score, 0) + COALESCE(p.focus_score, 0) + COALESCE(p.algebraic_logic_score, 0) + COALESCE(p.memory_score, 0) + COALESCE(p.cfop_spatial_record, 0)) / 5.0)::integer,
    (COALESCE(p.schulte_sessions, 0) + COALESCE(p.sudoku_sessions, 0) + COALESCE(p.stroop_sessions, 0) + COALESCE(p.reaction_sessions, 0) + COALESCE(p.memory_sessions, 0) + COALESCE(p.nback_sessions, 0) + COALESCE(p.math_sessions, 0) + COALESCE(p.gonogo_sessions, 0) + COALESCE(p.mental_sessions, 0) + COALESCE(p.corsi_sessions, 0) + COALESCE(p.trail_sessions, 0) + COALESCE(p.search_sessions, 0)) * 25
  ) as cognitive_index
FROM public.profiles_decayed p
WHERE NOT p.flagged AND p.role != 'guest';

GRANT SELECT ON public.public_leaderboard TO authenticated, anon;


-- 3. P2/P3: Slack webhook moved to vault
CREATE OR REPLACE FUNCTION public.check_system_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_url text;
  -- variables for latency
  v_total_rounds int;
  v_buckets jsonb;
  v_p95 float;
  v_pool_count int;
BEGIN
  -- We get webhook URL securely from vault instead of GUC
  BEGIN
    SELECT decrypted_secret INTO v_webhook_url FROM vault.decrypted_secrets WHERE name = 'slack_webhook_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_webhook_url := NULL;
  END;

  -- (The rest of the function remains the same as phase 13)
  -- Measure latency via Prometheus-style bucket interpolation (Sprint 2)
  SELECT 
    count(*),
    jsonb_build_object(
      'le_100', count(*) filter (where elapsed_ms <= 100),
      'le_500', count(*) filter (where elapsed_ms <= 500),
      'le_1000', count(*) filter (where elapsed_ms <= 1000),
      'le_2000', count(*) filter (where elapsed_ms <= 2000),
      'le_5000', count(*) filter (where elapsed_ms <= 5000)
    )
  INTO v_total_rounds, v_buckets
  FROM public.observability_events
  WHERE event_type = 'round_scored'
    AND created_at >= now() - interval '5 minutes';

  -- Calculate p95 if enough data
  IF v_total_rounds > 10 THEN
    -- Simplified interpolation logic...
    IF (v_buckets->>'le_100')::int >= v_total_rounds * 0.95 THEN v_p95 := 100;
    ELSIF (v_buckets->>'le_500')::int >= v_total_rounds * 0.95 THEN v_p95 := 500;
    ELSIF (v_buckets->>'le_1000')::int >= v_total_rounds * 0.95 THEN v_p95 := 1000;
    ELSIF (v_buckets->>'le_2000')::int >= v_total_rounds * 0.95 THEN v_p95 := 2000;
    ELSE v_p95 := 5000;
    END IF;

    IF v_p95 > 1000 THEN
      IF v_webhook_url IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_webhook_url,
          body := jsonb_build_object('text', format('[P1] High latency detected: P95 is %s ms', v_p95))
        );
      END IF;
    END IF;
  END IF;

  -- Check pool depletion
  SELECT count(*) INTO v_pool_count FROM public.ticket_pool WHERE status = 'available';
  IF v_pool_count < 100 THEN
    IF v_webhook_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_webhook_url,
        body := jsonb_build_object('text', format('[P0] Ticket pool critical: %s remaining', v_pool_count))
      );
    END IF;
  END IF;
END;
$$;


-- 4. P2/P3: Avatar bucket public + path extension check
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;

CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );

/* -----------------------------------------------------------------------------
   [16/43] File: 20260927000000_phase16_admin_ledger_fallback.sql
   ----------------------------------------------------------------------------- */

-- ==============================================================================
-- 20260927000000_phase16_admin_ledger_fallback.sql
-- ==============================================================================

SET lock_timeout = '2s';

-- 1. Redefine admin_grant_tx to ONLY insert into xp_events (Ledger-based)
CREATE OR REPLACE FUNCTION public.admin_grant_tx(
  p_actor_id uuid,
  p_target_id uuid,
  p_patch jsonb,
  p_context jsonb,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
  v_xp_delta int := 0;
  v_current_xp int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT coalesce(total_xp, 0) INTO v_current_xp FROM public.profiles WHERE id = p_target_id;

  IF p_patch ? 'total_xp' THEN
    v_xp_delta := (p_patch->>'total_xp')::int - v_current_xp;
  END IF;

  
    IF v_xp_delta <> 0 THEN
      IF abs(v_xp_delta) > 10000000 THEN
        RAISE EXCEPTION 'delta out of range: %', v_xp_delta;
      END IF;
      IF v_current_xp + v_xp_delta > 200000000 THEN
        RAISE EXCEPTION 'resulting total_xp exceeds XP_MAX';
      END IF;

      INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, created_at)
      VALUES (p_target_id, 'admin_grant', 0, v_xp_delta, now());
    END IF;

  UPDATE public.profiles
  SET
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record)
  WHERE id = p_target_id
  RETURNING * INTO v_new_profile;

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;


-- 2. Modify training_sessions to add shared_inspector_version
ALTER TABLE public.training_sessions 
ADD COLUMN IF NOT EXISTS shared_inspector_version integer default null;


-- 3. Replace submit_round_transaction to accept shared_inspector_version
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version text default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
BEGIN
  -- 1) Validate ticket if provenance is online
  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or missing ticket'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'Ticket does not belong to user'; END IF;
    IF v_ticket.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Ticket already used'; END IF;
  ELSE
    -- For offline, mock a ticket
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today_xp := coalesce((
    SELECT sum(xp_awarded) FROM public.xp_events
    WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
  ), 0);

  -- Anticheat: Max 500 games per day
  IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
    v_xp := 0;
  ELSIF v_today_xp < 500 THEN
    v_xp := LEAST(10, 500 - v_today_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_user_id, p_game, p_round_score, v_xp);
  END IF;

  INSERT INTO public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  v_new_level := public.calculate_level(v_old_xp + v_xp);

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.cfop_spatial_record, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
  v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
  v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
  v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
  v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
    v_streak := coalesce(v_streak, 0) + 1;
  ELSIF v_recent = 0 THEN
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET
    level = v_new_level,
    last_active_date = now(),
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = GREATEST(coalesce(peak_rating_speed, 0), v_speed),
    peak_rating_focus = GREATEST(coalesce(peak_rating_focus, 0), v_focus),
    peak_rating_spatial = GREATEST(coalesce(peak_rating_spatial, 0), v_spatial),
    peak_rating_logic = GREATEST(coalesce(peak_rating_logic, 0), v_logic),
    peak_rating_memory = GREATEST(coalesce(peak_rating_memory, 0), v_memory),
    cfop_spatial_record = GREATEST(coalesce(cfop_spatial_record, 0), p_round_score)
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET completed_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + v_xp,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, text, integer, timestamptz, text, integer)
  TO service_role;


-- 4. Ticket Pool Fallback and Cron
CREATE OR REPLACE FUNCTION public.start_round_with_pool(p_user_id uuid, p_game text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_started_at timestamptz;
  v_expires_at timestamptz;
BEGIN
  WITH claimed AS (
    SELECT id FROM public.ticket_pool LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.ticket_pool WHERE id IN (SELECT id FROM claimed)
  RETURNING id INTO v_ticket_id;

  IF v_ticket_id IS NULL THEN
    -- Degradation instead of failure: mint a ticket on the fly
    INSERT INTO public.round_tickets (user_id, game, started_at, expires_at)
    VALUES (p_user_id, p_game, now(), now() + interval '3 hours')
    RETURNING id INTO v_ticket_id;

    -- Also alert about the fallback
    PERFORM public.trigger_alert('pool.exhausted_fallback', 'P1', 'Ticket pool is empty, generating on the fly');
    
    RETURN json_build_object('ticketId', v_ticket_id);
  END IF;

  v_started_at := now();
  v_expires_at := v_started_at + interval '3 hours';

  INSERT INTO public.round_tickets (id, user_id, game, started_at, expires_at)
  VALUES (v_ticket_id, p_user_id, p_game, v_started_at, v_expires_at);

  RETURN json_build_object('ticketId', v_ticket_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.top_up_ticket_pool()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool_count int;
BEGIN
  SELECT count(*) INTO v_pool_count FROM public.ticket_pool;
  IF v_pool_count < 2000 THEN
    INSERT INTO public.ticket_pool (id)
    SELECT gen_random_uuid() FROM generate_series(1, 1000)
    WHERE (SELECT count(*) FROM public.ticket_pool) < 2000;
  END IF;
END;
$$;

-- We already have the cron job schedule, just make sure we update it to every minute instead of 5 minutes.
-- Because pg_cron extensions might not be active in local migrations, we wrap it in a DO block.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'top_up_ticket_pool',
      '* * * * *',
      $job$SELECT public.top_up_ticket_pool()$job$
    );
  END IF;
END;
$do$;

/* -----------------------------------------------------------------------------
   [17/43] File: 20260927010000_phase17_population_stats_guest.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
CREATE OR REPLACE FUNCTION public.get_population_stats(p_min_rounds integer default 5)
RETURNS table(mean double precision, sd double precision, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH calibrated AS (
    SELECT cognitive_index as idx
    FROM public.profiles_decayed
    WHERE NOT flagged AND role != 'guest'
      AND (
        coalesce(schulte_sessions, 0)
        + coalesce(sudoku_sessions, 0)
        + coalesce(stroop_sessions, 0)
        + coalesce(reaction_sessions, 0)
        + coalesce(memory_sessions, 0)
        + coalesce(nback_sessions, 0)
        + coalesce(math_sessions, 0)
        + coalesce(gonogo_sessions, 0)
        + coalesce(mental_sessions, 0)
        + coalesce(corsi_sessions, 0)
        + coalesce(trail_sessions, 0)
        + coalesce(search_sessions, 0)
      ) >= p_min_rounds
  )
  SELECT 
    coalesce(avg(idx), 380) as mean,
    coalesce(stddev_samp(idx), 180) as sd,
    count(*) as n
  FROM calibrated;
$$;

/* -----------------------------------------------------------------------------
   [18/43] File: 20260927020000_phase18_needs_rescore.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- migration
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS needs_rescore boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sessions_needs_rescore
  ON training_sessions (needs_rescore) WHERE needs_rescore;

/* -----------------------------------------------------------------------------
   [19/43] File: 20260927030000_phase19_histogram_p95.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿CREATE OR REPLACE FUNCTION public.histogram_p95(
  b100 bigint, b300 bigint, b500 bigint,
  b800 bigint, b2000 bigint, total bigint
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE target numeric := total * 0.95;
BEGIN
  IF total = 0 THEN RETURN NULL; END IF;
  IF b2000 < target THEN RETURN NULL; END IF;
  IF b100 >= target THEN RETURN 100 * target / nullif(b100, 0); END IF;
  IF b300 >= target THEN RETURN 100 + 200 * (target - b100) / nullif(b300 - b100, 0); END IF;
  IF b500 >= target THEN RETURN 300 + 200 * (target - b300) / nullif(b500 - b300, 0); END IF;
  IF b800 >= target THEN RETURN 500 + 300 * (target - b500) / nullif(b800 - b500, 0); END IF;
  RETURN 800 + 1200 * (target - b800) / nullif(b2000 - b800, 0);
END $$;

/* -----------------------------------------------------------------------------
   [20/43] File: 20260927040000_phase20_fp_rate.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
CREATE TABLE IF NOT EXISTS public.cheat_flag_review_queue (
  flag_id uuid PRIMARY KEY REFERENCES public.cheat_flags(id) ON DELETE CASCADE,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id),
  review_status text
);

-- Add sampled_for_review column to cheat_flags if not exists
ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS sampled_for_review boolean NOT NULL DEFAULT false;

-- Add cron job for sampling (weekly)
SELECT cron.schedule(
  'sample_cheat_flags',
  '0 0 * * 0', -- Every Sunday at midnight
  $$
    INSERT INTO public.cheat_flag_review_queue (flag_id, sampled_at)
    SELECT id, now() FROM public.cheat_flags
    WHERE severity = 'hard'
      AND created_at > now() - interval '7 days'
      AND review_status IS NULL
    ORDER BY random() LIMIT 50;
    
    UPDATE public.cheat_flags
    SET sampled_for_review = true
    WHERE id IN (SELECT flag_id FROM public.cheat_flag_review_queue WHERE sampled_at > now() - interval '1 hour');
  $$
);

/* -----------------------------------------------------------------------------
   [21/43] File: 20260927050000_phase21_strict_profile_rpc.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿BEGIN;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_my_birth_year(p_birth_year smallint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_birth_year < 1900 OR p_birth_year > extract(year FROM current_date)::int - 13 THEN RAISE EXCEPTION 'invalid_birth_year' USING ERRCODE = '22023'; END IF;
  UPDATE public.profiles SET birth_year = p_birth_year WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_birth_year(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_birth_year(smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  -- Basic check for valid url or path could be added here
  UPDATE public.profiles SET avatar_url = p_avatar_url WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;


COMMIT;

/* -----------------------------------------------------------------------------
   [22/43] File: 20260927060000_phase22_idempotency_and_ledger.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
ALTER TABLE public.xp_events 
  ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'round_award',
  ADD COLUMN IF NOT EXISTS round_id uuid;

BEGIN;

-- 1. Idempotency (Offline sync constraints)
ALTER TABLE public.round_tickets ADD CONSTRAINT round_tickets_user_client_round_unique UNIQUE (user_id, client_round_id);
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_source_unique ON public.xp_events(user_id, source_key) WHERE source_key IS NOT NULL;

-- 2. Modify admin_reset_stats to append negative XP event
CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_actor uuid,
  p_target uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_profile record;
  v_old_xp integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target;

  PERFORM set_config('gamification.is_xp_trigger', 'true', true);
  
  UPDATE public.profiles
  SET
    total_xp = 0,
    stats_epoch = now(),
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    synapse_streak = 0
  WHERE id = p_target
  RETURNING * INTO v_new_profile;
  
  PERFORM set_config('gamification.is_xp_trigger', 'false', true);

  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, xp_awarded, reason, source_key)
    VALUES (p_target, -v_old_xp, 'admin_reset', 'admin_reset_' || now()::text);
  END IF;

  -- Delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- Insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset_stats', '{}'::jsonb, p_request_id);

  RETURN row_to_json(v_new_profile)::jsonb;
END;
$$;

-- 3. Modify check_xp_ledger to not filter by stats_epoch
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mismatches integer;
  v_run_id bigint;
BEGIN
  insert into public.cron_runs(job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*)
    INTO v_mismatches
    FROM public.profiles p
    LEFT JOIN (
      SELECT e.user_id, SUM(e.xp_awarded) as s 
      FROM public.xp_events e
      GROUP BY e.user_id
    ) x ON x.user_id = p.id 
    WHERE coalesce(p.total_xp, 0) <> coalesce(x.s, 0);

    IF v_mismatches > 0 THEN
      PERFORM public.trigger_alert('xp_ledger_mismatch', 'P1', format('Found %s users with mismatched XP!', v_mismatches));
    END IF;

    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
END;
$$;

COMMIT;

/* -----------------------------------------------------------------------------
   [23/43] File: 20260927070000_phase23_offline_sync_rpc.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿BEGIN;
CREATE OR REPLACE FUNCTION public.submit_offline_round_tx(
  p_user_id uuid,
  p_client_round_id text,
  p_game text,
  p_started_at timestamptz,
  p_axes jsonb,
  p_round_score integer,
  p_label text,
  p_time_ms integer,
  p_is_hard_cheat boolean,
  p_cheat_reasons jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_res jsonb;
  f jsonb;
BEGIN
  -- 1. Insert ticket (claim client_round_id) or fail
  BEGIN
    INSERT INTO public.round_tickets (user_id, game, started_at, client_round_id)
    VALUES (p_user_id, p_game, p_started_at, p_client_round_id)
    RETURNING id INTO v_ticket_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END;

  -- 2. If it's a hard cheat, mark rejected and don't grant anything
  IF p_is_hard_cheat THEN
    UPDATE public.round_tickets SET submitted_at = now(), status = 'rejected' WHERE id = v_ticket_id;
    IF p_cheat_reasons IS NOT NULL AND jsonb_typeof(p_cheat_reasons) = 'array' THEN
      FOR f IN SELECT * FROM jsonb_array_elements(p_cheat_reasons)
      LOOP
        PERFORM public.record_cheat_flag(p_user_id, p_game, f->>'msg', 'hard', f->'detail');
      END LOOP;
    END IF;
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- 3. If soft cheats exist, record them
  IF p_cheat_reasons IS NOT NULL AND jsonb_typeof(p_cheat_reasons) = 'array' THEN
    FOR f IN SELECT * FROM jsonb_array_elements(p_cheat_reasons)
    LOOP
      PERFORM public.record_cheat_flag(p_user_id, p_game, f->>'msg', 'soft', f->'detail');
    END LOOP;
  END IF;

  -- 4. Execute the main transaction logic
  v_res := public.submit_round_transaction(p_user_id, v_ticket_id, p_game, p_axes, p_round_score, p_label, p_time_ms);
  
  -- 5. Return success
  RETURN jsonb_build_object('status', 'ok', 'ticket_id', v_ticket_id, 'result', v_res);
END;
$$;
COMMIT;

/* -----------------------------------------------------------------------------
   [24/43] File: 20260927080000_phase24_offline_practice.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿-- Phase 24: Offline Practice

BEGIN;
CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version text default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
BEGIN
  -- 1) Validate ticket if provenance is online
  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or missing ticket'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'Ticket does not belong to user'; END IF;
    IF v_ticket.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Ticket already used'; END IF;
  ELSE
    -- For offline, mock a ticket
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today_xp := coalesce((
    SELECT sum(xp_awarded) FROM public.xp_events
    WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
  ), 0);

  -- Anticheat: Max 500 games per day
  IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
    v_xp := 0;
  ELSIF v_today_xp < 500 THEN
    v_xp := LEAST(CASE WHEN p_provenance = 'online' THEN 10 ELSE 2 END, 500 - v_today_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_user_id, p_game, p_round_score, v_xp);
  END IF;

  INSERT INTO public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  v_new_level := public.calculate_level(v_old_xp + v_xp);

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.cfop_spatial_record, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  IF p_provenance = 'online' THEN
    v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
    v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
    v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
    v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
    v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);
  ELSE
    v_speed := coalesce(v_profile.speed_score, 0);
    v_focus := coalesce(v_profile.focus_score, 0);
    v_spatial := coalesce(v_profile.cfop_spatial_record, 0);
    v_logic := coalesce(v_profile.algebraic_logic_score, 0);
    v_memory := coalesce(v_profile.memory_score, 0);
  END IF;

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
    v_streak := coalesce(v_streak, 0) + 1;
  ELSIF v_recent = 0 THEN
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET
    level = v_new_level,
    last_active_date = now(),
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_speed, 0), v_speed) ELSE peak_rating_speed END,
    peak_rating_focus = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_focus, 0), v_focus) ELSE peak_rating_focus END,
    peak_rating_spatial = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_spatial, 0), v_spatial) ELSE peak_rating_spatial END,
    peak_rating_logic = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_logic, 0), v_logic) ELSE peak_rating_logic END,
    peak_rating_memory = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_memory, 0), v_memory) ELSE peak_rating_memory END,
    cfop_spatial_record = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(cfop_spatial_record, 0), p_round_score) ELSE cfop_spatial_record END
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET completed_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + v_xp,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;
COMMIT;

/* -----------------------------------------------------------------------------
   [25/43] File: 20260927090000_phase25_admin_reset_stats_atomicity.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿-- Phase 25: Admin Mutation Atomicity

BEGIN;

-- 1. Redefine admin_reset_profile to be atomic and correct
CREATE OR REPLACE FUNCTION public.admin_reset_profile(
  p_target uuid,
  p_actor uuid,
  p_request_id text,
  p_patch jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_profile public.profiles;
  v_old_xp integer;
BEGIN
  -- MFA verification requirement
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' THEN
    RAISE EXCEPTION 'MFA verification required (aal2) for admin endpoints';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND is_admin()) THEN
    RAISE EXCEPTION 'Admin access denied';
  END IF;

  -- FOR UPDATE to lock the profile
  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  PERFORM set_config('gamification.is_xp_trigger', 'true', true);

  UPDATE public.profiles
  SET 
    algebraic_logic_score = COALESCE((p_patch->>'algebraic_logic_score')::int, algebraic_logic_score),
    memory_score = COALESCE((p_patch->>'memory_score')::int, memory_score),
    speed_score = COALESCE((p_patch->>'speed_score')::int, speed_score),
    focus_score = COALESCE((p_patch->>'focus_score')::int, focus_score),
    cfop_spatial_record = COALESCE((p_patch->>'cfop_spatial_record')::int, cfop_spatial_record),
    total_xp = COALESCE((p_patch->>'total_xp')::int, total_xp),
    last_active_date = NULL,
    -- Ignore stats_epoch from patch, use now()
    stats_epoch = now(),
    schulte_sessions = COALESCE((p_patch->>'schulte_sessions')::int, schulte_sessions),
    sudoku_sessions = COALESCE((p_patch->>'sudoku_sessions')::int, sudoku_sessions),
    stroop_sessions = COALESCE((p_patch->>'stroop_sessions')::int, stroop_sessions),
    reaction_sessions = COALESCE((p_patch->>'reaction_sessions')::int, reaction_sessions),
    memory_sessions = COALESCE((p_patch->>'memory_sessions')::int, memory_sessions),
    nback_sessions = COALESCE((p_patch->>'nback_sessions')::int, nback_sessions),
    math_sessions = COALESCE((p_patch->>'math_sessions')::int, math_sessions),
    gonogo_sessions = COALESCE((p_patch->>'gonogo_sessions')::int, gonogo_sessions),
    mental_sessions = COALESCE((p_patch->>'mental_sessions')::int, mental_sessions),
    corsi_sessions = COALESCE((p_patch->>'corsi_sessions')::int, corsi_sessions),
    trail_sessions = COALESCE((p_patch->>'trail_sessions')::int, trail_sessions)
  WHERE id = p_target
  RETURNING * INTO v_profile;

  -- Balance XP ledger with negative event
  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events(user_id, source_key, game, xp_awarded, delta, source)
    VALUES (p_target, 'admin_reset_' || extract(epoch from now())::text, 'admin_reset', -v_old_xp, -v_old_xp, 'admin_reset');
  END IF;

  -- delete achievements and quests
  DELETE FROM public.user_achievements WHERE user_id = p_target;
  DELETE FROM public.user_quests WHERE user_id = p_target;

  -- insert audit log
  INSERT INTO public.admin_audit(actor_id, target_id, action, context, request_id)
  VALUES (p_actor, p_target, 'reset', '{}'::jsonb, COALESCE(p_request_id, ''));

  RETURN v_profile;
END;
$body$;

-- 2. Drop strict foreign keys on admin_audit to allow auditing deleted users
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_target_id_fkey;
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_actor_id_fkey;

COMMIT;

/* -----------------------------------------------------------------------------
   [26/43] File: 20260927100000_phase26_security_hardening.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- Phase 26: SECURITY DEFINER Hardening and Player Search Privacy

BEGIN;

-- 1. Add privacy control to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS search_visible boolean DEFAULT true NOT NULL;

-- 2. Update search_players with privacy, rate limits, and search_path hardening
CREATE OR REPLACE FUNCTION public.search_players(p_query text, p_limit integer default 10)
RETURNS table (id uuid, username text, avatar_url text, cognitive_index double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 15 searches per 5 minutes per user
  IF NOT public.check_rate_limit('search_' || auth.uid()::text, 15, 300) THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = '42900';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_url, p.cognitive_index
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND p.search_visible = true
    AND length(coalesce(trim(p_query), '')) >= 2
    AND p.username ILIKE '%' || trim(p_query) || '%'
  ORDER BY p.cognitive_index DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 10), 25));
END;
$body$;

REVOKE ALL ON FUNCTION public.search_players(text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_players(text, integer) TO authenticated;

-- 3. Harden other SECURITY DEFINER functions with SET search_path = ''
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_user uuid := auth.uid();
  v_existing public.friendships;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_target IS NULL OR p_target = v_user THEN RAISE EXCEPTION 'Invalid target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT * INTO v_existing FROM public.friendships f
  WHERE least(f.requester_id, f.addressee_id) = least(v_user, p_target)
    AND greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_target);

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'Already friends';
    ELSIF v_existing.status = 'pending' THEN
      IF v_existing.addressee_id = v_user THEN
        UPDATE public.friendships SET status = 'accepted' WHERE id = v_existing.id;
        RETURN jsonb_build_object('status', 'accepted');
      ELSE
        RAISE EXCEPTION 'Request already pending';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (v_user, p_target, 'pending');

  RETURN jsonb_build_object('status', 'pending');
END;
$body$;
REVOKE ALL ON FUNCTION public.send_friend_request(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

COMMIT;

/* -----------------------------------------------------------------------------
   [27/43] File: 20260927110000_phase27_session_versioning.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- ==============================================================================
-- 20260927110000_phase27_session_versioning.sql
-- ==============================================================================

-- 1. Ensure rating_model_version column exists on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rating_model_version integer NOT NULL DEFAULT 1;

-- 2. Update get_population_stats to filter by model version
CREATE OR REPLACE FUNCTION public.get_population_stats(
  p_min_rounds integer default 5,
  p_rating_model_version integer default 1
)
RETURNS table(mean double precision, sd double precision, n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT 
    coalesce(avg(cognitive_index), 500)::double precision as mean,
    coalesce(stddev_pop(cognitive_index), 100)::double precision as sd,
    count(*)::bigint as n
  FROM public.profiles
  WHERE (schulte_sessions + sudoku_sessions + stroop_sessions + reaction_sessions + memory_sessions + nback_sessions + math_sessions + gonogo_sessions + mental_sessions + corsi_sessions + trail_sessions + search_sessions) >= p_min_rounds
    AND rating_model_version = p_rating_model_version;
$body$;

GRANT EXECUTE ON FUNCTION public.get_population_stats(integer, integer) TO authenticated, anon;

/* -----------------------------------------------------------------------------
   [28/43] File: 20260927120000_phase28_p0_rls_columns.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

-- 1. Revoke global UPDATE on profiles from anon and authenticated
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;

-- 2. Grant column-specific UPDATE to authenticated only for non-protected fields
GRANT UPDATE (username, birth_year, avatar_url, search_visible) ON TABLE public.profiles TO authenticated;

COMMIT;

/* -----------------------------------------------------------------------------
   [29/43] File: 20260927130000_phase29_p0_idempotency_locks.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

-- 1. Thêm các Unique Constraints để tránh race conditions (lost-update, duplicated rewards)
-- duplicate constraint removed

-- Lưu ý: Nếu round_id chưa tồn tại trên training_sessions thì thêm, nhưng mặc định training_sessions sinh id uuid nên round_id chính là id. 
-- Giả sử ID của ticket chính là round_id của training_sessions thì:
-- Wait, in training_sessions, round_tickets id = round_id? 
-- The table might not have round_id, it just has id. Actually let's check schema.
-- I'll use the unique constraint mentioned by the reviewer.
-- redundant unique constraint on PK removed

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_round_award_unique ON public.xp_events (round_id) WHERE event_type = 'round_award';

-- 2. Audit & Lock SECURITY DEFINER (sử dụng psql script để tự động set search_path = '')
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT
            p.oid::regprocedure AS proc_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        EXECUTE 'ALTER FUNCTION ' || r.proc_name || ' SET search_path = ''''';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.proc_name || ' FROM PUBLIC';
    END LOOP;
END
$$;

COMMIT;

/* -----------------------------------------------------------------------------
   [30/43] File: 20260927140000_phase30_guest_upgrade.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

-- 1. Create upgrade_operations table for the state machine
CREATE TABLE IF NOT EXISTS public.upgrade_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  target_username text NOT NULL,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Unique index to prevent multiple pending upgrades for the same user
CREATE UNIQUE INDEX IF NOT EXISTS upgrade_operations_user_pending_idx ON public.upgrade_operations (user_id) WHERE status = 'pending_verification';

-- 2. Create unique index for username to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_ci_unique ON public.profiles (lower(username));

-- 3. Trigger to finalize upgrade upon email confirmation
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if email just became confirmed
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Update profile role from guest to user
    UPDATE public.profiles 
    SET role = 'user' 
    WHERE id = NEW.id AND role = 'guest';
    
    -- Mark operation as completed
    UPDATE public.upgrade_operations 
    SET status = 'completed', completed_at = now() 
    WHERE user_id = NEW.id AND status = 'pending_verification';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_user_email_confirmation();

COMMIT;

/* -----------------------------------------------------------------------------
   [31/43] File: 20260927160001_phase32_manual_reviews.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

CREATE TABLE IF NOT EXISTS public.manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.round_tickets(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  compensation_xp integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_reviews ENABLE ROW LEVEL SECURITY;

-- Only admins can interact with this table
CREATE POLICY "Admins can manage manual_reviews"
  ON public.manual_reviews
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Update timestamp trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.manual_reviews
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

COMMIT;

/* -----------------------------------------------------------------------------
   [32/43] File: 20260927160002_phase35_final_ai_review.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

-- ==============================================================================
-- 1. IDEMPOTENCY & OFFLINE FIXES
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'round_tickets_user_client_round_uq') THEN
    ALTER TABLE public.round_tickets ADD CONSTRAINT round_tickets_user_client_round_uq UNIQUE (user_id, client_round_id);
  END IF;
END $$;

ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.round_tickets(id);
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_ticket_uq ON public.training_sessions(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_round_award_uq ON public.xp_events(source_key) WHERE event_type = 'round_award' AND source_key IS NOT NULL;

-- ==============================================================================
-- 2. GENERATION/EPOCH FOR STATS (RESET FIX)
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stats_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS stats_generation bigint NOT NULL DEFAULT 0;

-- ==============================================================================
-- 3. COLUMN-LEVEL RLS
-- ==============================================================================
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT UPDATE (username, birth_year, avatar_url) ON TABLE public.profiles TO authenticated;

-- ==============================================================================
-- 4. GUEST UPGRADE STATE MACHINE FIXES
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS upgrade_one_pending_per_user ON public.upgrade_operations (user_id) WHERE status = 'pending_verification';

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op public.upgrade_operations%rowtype;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    SELECT * INTO v_op FROM public.upgrade_operations 
    WHERE user_id = NEW.id AND status = 'pending_verification'
    FOR UPDATE;
    
    IF NOT FOUND THEN RETURN NEW; END IF;
    
    IF v_op.created_at < now() - interval '24 hours' THEN
      UPDATE public.upgrade_operations SET status = 'failed' WHERE id = v_op.id;
      RETURN NEW;
    END IF;
    
    IF lower(NEW.email) != lower(v_op.target_email) THEN RETURN NEW; END IF;

    UPDATE public.profiles 
    SET role = 'user', username = v_op.target_username
    WHERE id = NEW.id AND role = 'guest';
    
    UPDATE public.upgrade_operations 
    SET status = 'completed', completed_at = now() 
    WHERE id = v_op.id;
    
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 5. ATOMIC ADMIN RPCs
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_grant(
  p_target_id uuid,
  p_xp_amount integer,
  p_xp_mode text,
  p_axes jsonb,
  p_axes_mode text,
  p_reason text,
  p_admin_id uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%rowtype;
  v_old_xp integer;
  v_new_xp integer;
  v_new_level integer;
  v_patch jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

  v_old_xp := coalesce(v_profile.total_xp, 0);
  
  IF p_xp_amount IS NOT NULL THEN
    IF p_xp_mode = 'set' THEN
      v_new_xp := p_xp_amount;
    ELSE
      v_new_xp := v_old_xp + p_xp_amount;
    END IF;
    v_new_level := public.calculate_level(v_new_xp);
    
    UPDATE public.profiles SET total_xp = v_new_xp, level = v_new_level WHERE id = p_target_id;

    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, event_type, stats_generation)
    VALUES (p_target_id, 'admin_grant', 0, v_new_xp - v_old_xp, 'admin_grant', v_profile.stats_generation);
    
    v_patch := jsonb_set(v_patch, '{total_xp}', to_jsonb(v_new_xp));
  END IF;

  IF p_axes IS NOT NULL AND jsonb_typeof(p_axes) = 'object' THEN
    -- Axes update logic mapped directly to DB columns
    -- speed_score, focus_score, spatial_score, algebraic_logic_score, memory_score
    IF p_axes ? 'speed' THEN
      UPDATE public.profiles SET speed_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'speed')::integer ELSE coalesce(speed_score, 0) + (p_axes->>'speed')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{speed}', p_axes->'speed');
    END IF;
    IF p_axes ? 'focus' THEN
      UPDATE public.profiles SET focus_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'focus')::integer ELSE coalesce(focus_score, 0) + (p_axes->>'focus')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{focus}', p_axes->'focus');
    END IF;
    IF p_axes ? 'spatial' THEN
      
      v_patch := jsonb_set(v_patch, '{spatial}', p_axes->'spatial');
    END IF;
    IF p_axes ? 'logic' THEN
      UPDATE public.profiles SET algebraic_logic_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'logic')::integer ELSE coalesce(algebraic_logic_score, 0) + (p_axes->>'logic')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{logic}', p_axes->'logic');
    END IF;
    IF p_axes ? 'memory' THEN
      UPDATE public.profiles SET memory_score = CASE WHEN p_axes_mode = 'set' THEN (p_axes->>'memory')::integer ELSE coalesce(memory_score, 0) + (p_axes->>'memory')::integer END WHERE id = p_target_id;
      v_patch := jsonb_set(v_patch, '{memory}', p_axes->'memory');
    END IF;
  END IF;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_admin_id, p_target_id, 'admin.grant', jsonb_build_object('reason', p_reason, 'patch', v_patch), p_request_id);

  RETURN jsonb_build_object('success', true, 'patch', v_patch);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_stats(
  p_target_id uuid,
  p_reason text,
  p_admin_id uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%rowtype;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

  UPDATE public.profiles
  SET 
    total_xp = 0,
    level = 1,
    stats_generation = stats_generation + 1,
    synapse_streak = 0,
    speed_score = null,
    focus_score = null,
    algebraic_logic_score = null,
    memory_score = null,
    peak_rating_speed = 0,
    peak_rating_focus = 0,
    peak_rating_spatial = 0,
    peak_rating_logic = 0,
    peak_rating_memory = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    cfop_spatial_record = 0
  WHERE id = p_target_id;

  INSERT INTO public.admin_audit (actor_id, target_id, action, context, request_id)
  VALUES (p_admin_id, p_target_id, 'admin.reset_stats', jsonb_build_object('reason', p_reason, 'old_generation', v_profile.stats_generation), p_request_id);

  RETURN jsonb_build_object('success', true, 'new_generation', v_profile.stats_generation + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant(uuid, integer, text, jsonb, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant(uuid, integer, text, jsonb, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_reset_stats(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_stats(uuid, text, uuid, text) TO service_role;

COMMIT;

/* -----------------------------------------------------------------------------
   [33/43] File: 20260927170000_phase36_submit_round_idempotency.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
BEGIN;

-- Add submitted_at to round_tickets if not exists to track exact consumption
ALTER TABLE public.round_tickets ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version integer default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
BEGIN
  -- Strict lock on ticket if online
  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'ticket_not_yours'; END IF;
    IF v_ticket.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'round_already_submitted'; END IF;
  ELSE
    -- For offline sync, mock the ticket fields
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  -- Lock profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today_xp := coalesce((
    SELECT sum(xp_awarded) FROM public.xp_events
    WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
  ), 0);

  -- Anticheat: Max 500 games per day
  IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
    v_xp := 0;
  ELSIF v_today_xp < 500 THEN
    -- Limit XP for offline rounds
    v_xp := LEAST(CASE WHEN p_provenance = 'online' THEN 10 ELSE 2 END, 500 - v_today_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, source_key, stats_generation)
    VALUES (p_user_id, p_game, p_round_score, v_xp, p_ticket_id::text, v_profile.stats_generation);
  END IF;

  INSERT INTO public.training_sessions(
    ticket_id, user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    CASE WHEN p_provenance = 'online' THEN p_ticket_id ELSE NULL END, 
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  v_new_level := public.calculate_level(v_old_xp + v_xp);

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.cfop_spatial_record, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  IF p_provenance = 'online' THEN
    v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
    v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
    v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
    v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
    v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);
  ELSE
    -- Offline matches are practice only and do not affect rating
    v_speed := coalesce(v_profile.speed_score, 0);
    v_focus := coalesce(v_profile.focus_score, 0);
    v_spatial := coalesce(v_profile.cfop_spatial_record, 0);
    v_logic := coalesce(v_profile.algebraic_logic_score, 0);
    v_memory := coalesce(v_profile.memory_score, 0);
  END IF;

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
    v_streak := coalesce(v_streak, 0) + 1;
  ELSIF v_recent = 0 THEN
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET
    total_xp = v_old_xp + v_xp,
    level = v_new_level,
    last_active_date = now(),
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_speed, 0), v_speed) ELSE peak_rating_speed END,
    peak_rating_focus = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_focus, 0), v_focus) ELSE peak_rating_focus END,
    peak_rating_spatial = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_spatial, 0), v_spatial) ELSE peak_rating_spatial END,
    peak_rating_logic = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_logic, 0), v_logic) ELSE peak_rating_logic END,
    peak_rating_memory = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_memory, 0), v_memory) ELSE peak_rating_memory END,
    cfop_spatial_record = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(cfop_spatial_record, 0), p_round_score) ELSE cfop_spatial_record END
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET completed_at = now(), submitted_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + v_xp,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer) TO service_role;

-- Revoke and grant other security definer functions correctly
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT
            p.oid::regprocedure AS proc_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        EXECUTE 'ALTER FUNCTION ' || r.proc_name || ' SET search_path = ''''';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.proc_name || ' FROM PUBLIC';
    END LOOP;
END
$$;

COMMIT;

/* -----------------------------------------------------------------------------
   [34/43] File: 20260927180000_phase37_offline_tx.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb);

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_offline_round_tx(
  p_user_id uuid,
  p_client_round_id text,
  p_game text,
  p_started_at timestamptz,
  p_axes jsonb,
  p_round_score integer,
  p_label text,
  p_time_ms integer,
  p_is_hard_cheat boolean,
  p_cheat_reasons jsonb,
  p_scorer_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket_id uuid;
  v_res jsonb;
BEGIN
  -- Insert a mock ticket to track offline round
  -- Use ON CONFLICT to ensure idempotency if multiple syncs hit simultaneously
  INSERT INTO public.round_tickets (
    user_id,
    client_round_id,
    game,
    started_at
  )
  VALUES (
    p_user_id,
    p_client_round_id,
    p_game,
    p_started_at
  )
  ON CONFLICT (user_id, client_round_id)
  DO NOTHING
  RETURNING id INTO v_ticket_id;

  IF v_ticket_id IS NULL THEN
    -- It was already inserted, meaning a duplicate submission
    RAISE EXCEPTION 'duplicate_offline_round';
  END IF;

  IF p_is_hard_cheat THEN
    -- If it's a hard cheat, we just mark the ticket as rejected and don't score it
    UPDATE public.round_tickets 
    SET completed_at = now(), submitted_at = now(), expires_at = now() 
    WHERE id = v_ticket_id;
    
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'hard_cheat');
  END IF;

  -- Use submit_round_transaction with provenance = 'offline_sync'
  v_res := public.submit_round_transaction(
    p_user_id,
    v_ticket_id,
    p_game,
    p_axes,
    p_round_score,
    p_label,
    p_time_ms,
    1, -- p_telemetry_version
    p_scorer_version,
    1, -- p_inspector_version
    p_started_at,
    'offline_sync',
    1  -- p_shared_inspector_version
  );

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_offline_round_tx(uuid, text, text, timestamptz, jsonb, integer, text, integer, boolean, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_offline_round_tx(uuid, text, text, timestamptz, jsonb, integer, text, integer, boolean, jsonb, integer) TO service_role;

COMMIT;

/* -----------------------------------------------------------------------------
   [35/43] File: 20260928120000_phase28_histogram_p95.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- Migration: phase28_histogram_p95
-- Description: Create shared function for p95 calculation

CREATE OR REPLACE FUNCTION public.histogram_p95(
  b100 bigint, b300 bigint, b500 bigint,
  b800 bigint, b2000 bigint, total bigint
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE target numeric := total * 0.95;
BEGIN
  IF total = 0 THEN RETURN NULL; END IF;
  IF b2000 < target THEN RETURN NULL; END IF;
  IF b100 >= target THEN RETURN 100 * target / nullif(b100, 0); END IF;
  IF b300 >= target THEN RETURN 100 + 200 * (target - b100) / nullif(b300 - b100, 0); END IF;
  IF b500 >= target THEN RETURN 300 + 200 * (target - b300) / nullif(b500 - b300, 0); END IF;
  IF b800 >= target THEN RETURN 500 + 300 * (target - b500) / nullif(b800 - b500, 0); END IF;
  RETURN 800 + 1200 * (target - b800) / nullif(b2000 - b800, 0);
END $$;

/* -----------------------------------------------------------------------------
   [36/43] File: 20260928130000_phase40_iter11_contracts.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- Migration: Iteration 11 Contract Drifts
-- Phase 40

-- 1. Profiles: birth_year to birth_date
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Migrate data
UPDATE public.profiles SET birth_date = make_date(birth_year, 1, 1) WHERE birth_year IS NOT NULL AND birth_date IS NULL;

-- Drop old constraint if exists and add new one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS birth_year_min_age;
ALTER TABLE public.profiles ADD CONSTRAINT birth_date_min_age CHECK (birth_date IS NULL OR birth_date <= current_date - interval '16 years');

-- Update RLS to allow updating birth_date instead of birth_year
REVOKE UPDATE (username, birth_year, avatar_url) ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (username, birth_date, avatar_url) ON TABLE public.profiles TO authenticated;

-- Drop old column (optional, can be done later, but we drop it now)
-- Keep birth_year for backward compatibility during expand-contract phase

-- 2. Round Tickets: Version Pinning and State
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'pre_mint',
  ADD COLUMN IF NOT EXISTS active_slot SMALLINT,
  ADD COLUMN IF NOT EXISTS submit_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating_model_version INTEGER,
  ADD COLUMN IF NOT EXISTS inspector_rule_set_hash TEXT,
  ADD COLUMN IF NOT EXISTS client_build_id TEXT,
  ADD COLUMN IF NOT EXISTS client_config_hash TEXT;

-- 2.5 RPC for claiming ticket (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.activate_round_ticket(
  p_user_id UUID,
  p_game TEXT,
  p_telemetry_version SMALLINT,
  p_scorer_version SMALLINT,
  p_inspector_version SMALLINT,
  p_rating_model_version INTEGER,
  p_inspector_rule_set_hash TEXT,
  p_challenge_seed TEXT,
  p_challenge_config JSONB,
  p_client_build_id TEXT,
  p_client_config_hash TEXT
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket public.round_tickets%rowtype;
BEGIN
  -- Claim an available pre_mint ticket
  SELECT * INTO v_ticket FROM public.round_tickets 
  WHERE state = 'pre_mint' 
  FOR UPDATE SKIP LOCKED LIMIT 1;
  
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'No available pre-minted tickets' USING ERRCODE = '55000';
  END IF;

  UPDATE public.round_tickets SET 
    state = 'activated',
    user_id = p_user_id,
    game = p_game,
    telemetry_version = p_telemetry_version,
    scorer_version = p_scorer_version,
    inspector_version = p_inspector_version,
    rating_model_version = p_rating_model_version,
    inspector_rule_set_hash = p_inspector_rule_set_hash,
    challenge_seed = p_challenge_seed,
    challenge_config = p_challenge_config,
    client_build_id = p_client_build_id,
    client_config_hash = p_client_config_hash,
    started_at = now(),
    submit_deadline = now() + interval '10 minutes'
  WHERE id = v_ticket.id RETURNING * INTO v_ticket;

  RETURN row_to_json(v_ticket);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_round_ticket FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_round_ticket TO service_role;

-- 3. Account Deletion Journal
CREATE TABLE IF NOT EXISTS public.account_deletion_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'sessions_revoked', 'storage_deleted', 'database_cleaned', 'auth_deleted', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_deletion_ops_status_idx ON public.account_deletion_operations(status);

-- 4. False Positive View
CREATE OR REPLACE VIEW public.effective_cheat_flag_review AS
SELECT DISTINCT ON (flag_id)
  flag_id as id,
  review_status,
  reviewer_id,
  reviewed_at
FROM public.cheat_flag_review_queue
WHERE review_status IS NOT NULL
ORDER BY flag_id, reviewed_at DESC;

-- 5. Revoke EXECUTE on finalize_guest_upgrade_tx
CREATE OR REPLACE FUNCTION public.finalize_guest_upgrade_tx(
  p_user_id UUID,
  p_target_email TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_op public.upgrade_operations%rowtype;
BEGIN
  -- FOR UPDATE locks the row to prevent race conditions
  SELECT * INTO v_op FROM public.upgrade_operations
  WHERE user_id = p_user_id AND target_email = p_target_email
  FOR UPDATE;

  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'No pending upgrade operation found for user.' USING ERRCODE = 'P0001';
  END IF;

  IF v_op.status != 'old_sessions_revoked' THEN
    RAISE EXCEPTION 'Cannot finalize upgrade, invalid status: %', v_op.status USING ERRCODE = 'P0002';
  END IF;

  -- Update role to user
  UPDATE public.profiles SET role = 'user' WHERE id = p_user_id;

  -- Mark operation as completed
  UPDATE public.upgrade_operations SET status = 'completed' WHERE id = v_op.id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_guest_upgrade_tx FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_guest_upgrade_tx TO service_role;

/* -----------------------------------------------------------------------------
   [37/43] File: 20260928140000_phase40_iter13_fixes.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- Iteration 13 Fixes

-- 1. Modify cheat_flags table
ALTER TABLE public.cheat_flags RENAME COLUMN severity TO signal_class;

-- Since severity was text, we don't necessarily need to change the type, but let's update values
UPDATE public.cheat_flags SET signal_class = 'statistical' WHERE signal_class = 'soft';
UPDATE public.cheat_flags SET signal_class = 'physical' WHERE signal_class = 'hard';

-- 2. Update record_cheat_flag
CREATE OR REPLACE FUNCTION public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_signal_class text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_round_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_signal_class NOT IN ('statistical', 'physical') THEN
    RAISE EXCEPTION 'Invalid signal_class';
  END IF;

  INSERT INTO public.cheat_flags(user_id, game, reason, signal_class, details, round_id)
  VALUES (p_user_id, NULLIF(p_game, ''), p_reason, p_signal_class, COALESCE(p_details, '{}'::jsonb), p_round_id);
END;
$$;

-- Drop the old one
DROP FUNCTION IF EXISTS public.record_cheat_flag(uuid, text, text, text, jsonb, uuid);

-- 3. Fix Race Condition in Ledger XP (admin_reset_stats)
CREATE OR REPLACE FUNCTION public.admin_reset_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_gen integer;
BEGIN
  -- SELECT FOR UPDATE locks the profile so concurrent finalize_accepted_round_tx or trg_xp_events_apply wait
  UPDATE public.profiles
  SET 
    total_xp = 0,
    stats_generation = stats_generation + 1
  WHERE id = p_user_id
  RETURNING stats_generation INTO v_new_gen;

  IF v_new_gen IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
END;
$$;

-- 4. Fix Race Condition in trg_xp_events_apply
CREATE OR REPLACE FUNCTION public.trg_xp_events_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gen integer;
BEGIN
  -- We read the latest stats_generation from profiles and override NEW.stats_generation
  -- We also lock the profile row to ensure we safely add XP
  SELECT stats_generation INTO v_gen
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_gen IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.stats_generation := v_gen;

  UPDATE public.profiles
  SET total_xp = total_xp + NEW.xp_awarded
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

/* -----------------------------------------------------------------------------
   [38/43] File: 20260929000001_phase38_round_tickets_state.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- AI Review Phase 38: Round Tickets State Machine & Server-bound Config

-- 1. Add Config & Seed columns
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS challenge_seed text,
  ADD COLUMN IF NOT EXISTS challenge_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1;

-- 2. Add State Machine columns
ALTER TABLE public.round_tickets
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'issued'
    CHECK (state IN ('issued', 'processing', 'accepted', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS processing_token uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Set default states for existing tickets
UPDATE public.round_tickets SET state = 'accepted' WHERE submitted_at IS NOT NULL AND state = 'issued';
UPDATE public.round_tickets SET state = 'expired' WHERE submitted_at IS NULL AND expires_at < now() AND state = 'issued';

-- 3. Rewrite submit_round_transaction
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version integer default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null,
  p_processing_token uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date;
  v_profile record;
  v_ticket record;
  v_recent integer;
  v_streak integer;
  v_xp integer := 0;
  v_today_xp integer := 0;
  v_old_xp integer;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'ticket_not_yours'; END IF;
    IF v_ticket.state <> 'processing' THEN RAISE EXCEPTION 'ticket_not_processing'; END IF;
    IF p_processing_token IS NOT NULL AND v_ticket.processing_token <> p_processing_token THEN
      RAISE EXCEPTION 'invalid_processing_token';
    END IF;
  ELSE
    -- For offline sync, mock the ticket fields
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  -- Lock profile
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today_xp := coalesce((
    SELECT sum(xp_awarded) FROM public.xp_events
    WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
  ), 0);

  IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
    v_xp := 0;
  ELSIF v_today_xp < 500 THEN
    v_xp := LEAST(CASE WHEN p_provenance = 'online' THEN 10 ELSE 2 END, 500 - v_today_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, source_key, stats_generation)
    VALUES (p_user_id, p_game, p_round_score, v_xp, coalesce(p_ticket_id::text, gen_random_uuid()::text), v_profile.stats_generation);
  END IF;

  INSERT INTO public.training_sessions(
    ticket_id, user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    CASE WHEN p_provenance = 'online' THEN p_ticket_id ELSE NULL END, 
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  v_new_level := public.calculate_level(v_old_xp + v_xp);

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.cfop_spatial_record, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  IF p_provenance = 'online' THEN
    v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
    v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
    v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
    v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
    v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);
  ELSE
    v_speed := coalesce(v_profile.speed_score, 0);
    v_focus := coalesce(v_profile.focus_score, 0);
    v_spatial := coalesce(v_profile.cfop_spatial_record, 0);
    v_logic := coalesce(v_profile.algebraic_logic_score, 0);
    v_memory := coalesce(v_profile.memory_score, 0);
  END IF;

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
    v_streak := coalesce(v_streak, 0) + 1;
  ELSIF v_recent = 0 THEN
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET
    total_xp = v_old_xp + v_xp,
    level = v_new_level,
    last_active_date = now(),
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_speed, 0), v_speed) ELSE peak_rating_speed END,
    peak_rating_focus = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_focus, 0), v_focus) ELSE peak_rating_focus END,
    peak_rating_spatial = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_spatial, 0), v_spatial) ELSE peak_rating_spatial END,
    peak_rating_logic = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_logic, 0), v_logic) ELSE peak_rating_logic END,
    peak_rating_memory = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_memory, 0), v_memory) ELSE peak_rating_memory END,
    cfop_spatial_record = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(cfop_spatial_record, 0), p_round_score) ELSE cfop_spatial_record END
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET state = 'accepted', completed_at = now(), submitted_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + v_xp,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer, uuid) TO service_role;

-- 4. Reject Ticket function (for cheat detection)
CREATE OR REPLACE FUNCTION public.reject_round_ticket(
  p_user_id uuid,
  p_ticket_id uuid,
  p_processing_token uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.round_tickets
  SET state = 'rejected',
      submitted_at = now(),
      completed_at = now()
  WHERE id = p_ticket_id
    AND user_id = p_user_id
    AND state = 'processing'
    AND processing_token = p_processing_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_round_ticket(uuid, uuid, uuid, text) TO service_role;

/* -----------------------------------------------------------------------------
   [39/43] File: 20260929000002_phase39_offline_xp_isolation.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- AI Review Phase 39: Offline XP Isolation

-- 1. Add event_type to xp_events
ALTER TABLE public.xp_events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'online_round'
  CHECK (event_type IN ('online_round', 'offline_practice', 'quest', 'achievement', 'admin_grant', 'round_award'));

-- Update existing offline rounds
UPDATE public.xp_events xe
SET event_type = 'offline_practice'
FROM public.training_sessions ts
WHERE xe.source_key = ts.ticket_id::text
  AND ts.provenance = 'offline_sync';

-- 2. Add practice_xp column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS practice_xp integer NOT NULL DEFAULT 0;

-- 3. Rewrite submit_round_transaction to separate practice_xp
DROP FUNCTION IF EXISTS public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer, uuid);

CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version integer default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_shared_inspector_version integer default null,
  p_processing_token uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date;
  v_profile record;
  v_ticket record;
  v_recent integer;
  v_streak integer;
  v_xp integer := 0;
  v_today_xp integer := 0;
  v_today_practice_xp integer := 0;
  v_old_xp integer;
  v_old_practice integer;
  v_old_level integer;
  v_new_level integer;
  v_idle integer;
  v_base_speed integer;
  v_base_focus integer;
  v_base_spatial integer;
  v_base_logic integer;
  v_base_memory integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  IF p_provenance = 'online' THEN
    SELECT * INTO v_ticket FROM public.round_tickets WHERE id = p_ticket_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
    IF v_ticket.user_id != p_user_id THEN RAISE EXCEPTION 'ticket_not_yours'; END IF;
    IF v_ticket.state <> 'processing' THEN RAISE EXCEPTION 'ticket_not_processing'; END IF;
    IF p_processing_token IS NOT NULL AND v_ticket.processing_token <> p_processing_token THEN
      RAISE EXCEPTION 'invalid_processing_token';
    END IF;
  ELSE
    v_ticket.started_at := coalesce(p_occurred_at, now());
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF p_provenance = 'online' THEN
    v_today_xp := coalesce((
      SELECT sum(xp_awarded) FROM public.xp_events
      WHERE user_id = p_user_id 
        AND event_type = 'online_round' 
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
    ), 0);
    IF (SELECT count(*) FROM public.training_sessions WHERE user_id = p_user_id AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today) > 500 THEN
      v_xp := 0;
    ELSIF v_today_xp < 500 THEN
      v_xp := LEAST(10, 500 - v_today_xp);
    ELSE
      v_xp := 0;
    END IF;
  ELSE
    v_today_practice_xp := coalesce((
      SELECT sum(xp_awarded) FROM public.xp_events
      WHERE user_id = p_user_id 
        AND event_type = 'offline_practice' 
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
    ), 0);
    IF v_today_practice_xp < 30 THEN
      v_xp := LEAST(2, 30 - v_today_practice_xp);
    ELSE
      v_xp := 0;
    END IF;
  END IF;

  IF v_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded, source_key, stats_generation, event_type)
    VALUES (p_user_id, p_game, p_round_score, v_xp, coalesce(p_ticket_id::text, gen_random_uuid()::text), v_profile.stats_generation, CASE WHEN p_provenance = 'online' THEN 'online_round' ELSE 'offline_practice' END);
  END IF;

  INSERT INTO public.training_sessions(
    ticket_id, user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    telemetry_version, scorer_version, inspector_version,
    occurred_at, recorded_at, provenance, shared_inspector_version
  ) VALUES (
    CASE WHEN p_provenance = 'online' THEN p_ticket_id ELSE NULL END, 
    p_user_id,
    p_game,
    nullif(p_label, ''),
    p_round_score,
    v_xp,
    greatest(0, least(7200000, coalesce(p_time_ms, 0))),
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_telemetry_version,
    p_scorer_version,
    p_inspector_version,
    coalesce(p_occurred_at, v_ticket.started_at),
    now(),
    p_provenance,
    p_shared_inspector_version
  );

  v_old_xp := coalesce(v_profile.total_xp, 0);
  v_old_practice := coalesce(v_profile.practice_xp, 0);
  v_old_level := coalesce(v_profile.level, 1);
  
  IF p_provenance = 'online' THEN
    v_new_level := public.calculate_level(v_old_xp + v_xp);
  ELSE
    v_new_level := v_old_level;
  END IF;

  v_idle := GREATEST(0, (EXTRACT(EPOCH FROM (now() - coalesce(v_profile.last_active_date, v_profile.created_at))) / 86400)::integer);
  
  v_base_speed := public.effective_rating(v_profile.speed_score, v_profile.peak_rating_speed, v_idle);
  v_base_focus := public.effective_rating(v_profile.focus_score, v_profile.peak_rating_focus, v_idle);
  v_base_spatial := public.effective_rating(v_profile.cfop_spatial_record, v_profile.peak_rating_spatial, v_idle);
  v_base_logic := public.effective_rating(v_profile.algebraic_logic_score, v_profile.peak_rating_logic, v_idle);
  v_base_memory := public.effective_rating(v_profile.memory_score, v_profile.peak_rating_memory, v_idle);

  IF p_provenance = 'online' THEN
    v_speed := public.apply_round_rating(v_base_speed, nullif(p_axes->>'speed','')::integer);
    v_focus := public.apply_round_rating(v_base_focus, nullif(p_axes->>'focus','')::integer);
    v_spatial := public.apply_round_rating(v_base_spatial, nullif(p_axes->>'spatial','')::integer);
    v_logic := public.apply_round_rating(v_base_logic, nullif(p_axes->>'logic','')::integer);
    v_memory := public.apply_round_rating(v_base_memory, nullif(p_axes->>'memory','')::integer);
  ELSE
    v_speed := coalesce(v_profile.speed_score, 0);
    v_focus := coalesce(v_profile.focus_score, 0);
    v_spatial := coalesce(v_profile.cfop_spatial_record, 0);
    v_logic := coalesce(v_profile.algebraic_logic_score, 0);
    v_memory := coalesce(v_profile.memory_score, 0);
  END IF;

  SELECT count(*) INTO v_recent FROM public.training_sessions
  WHERE user_id = p_user_id AND provenance = 'online' AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_today - interval '2 days';

  v_streak := v_profile.synapse_streak;
  IF p_provenance = 'online' THEN
    IF v_recent > 0 AND (v_profile.last_active_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < v_today THEN
      v_streak := coalesce(v_streak, 0) + 1;
    ELSIF v_recent = 0 THEN
      v_streak := 1;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    total_xp = v_old_xp + CASE WHEN p_provenance = 'online' THEN v_xp ELSE 0 END,
    practice_xp = v_old_practice + CASE WHEN p_provenance = 'online' THEN 0 ELSE v_xp END,
    level = v_new_level,
    last_active_date = CASE WHEN p_provenance = 'online' THEN now() ELSE last_active_date END,
    synapse_streak = v_streak,
    speed_score = v_speed,
    focus_score = v_focus,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions = schulte_sessions + CASE WHEN p_game = 'schulte' THEN 1 ELSE 0 END,
    sudoku_sessions = sudoku_sessions + CASE WHEN p_game = 'sudoku' THEN 1 ELSE 0 END,
    stroop_sessions = stroop_sessions + CASE WHEN p_game = 'stroop' THEN 1 ELSE 0 END,
    reaction_sessions = reaction_sessions + CASE WHEN p_game = 'reaction' THEN 1 ELSE 0 END,
    memory_sessions = memory_sessions + CASE WHEN p_game = 'memory' THEN 1 ELSE 0 END,
    nback_sessions = nback_sessions + CASE WHEN p_game = 'nback' THEN 1 ELSE 0 END,
    math_sessions = math_sessions + CASE WHEN p_game = 'math' THEN 1 ELSE 0 END,
    gonogo_sessions = gonogo_sessions + CASE WHEN p_game = 'gonogo' THEN 1 ELSE 0 END,
    mental_sessions = mental_sessions + CASE WHEN p_game = 'mental' THEN 1 ELSE 0 END,
    corsi_sessions = corsi_sessions + CASE WHEN p_game = 'corsi' THEN 1 ELSE 0 END,
    trail_sessions = trail_sessions + CASE WHEN p_game = 'trail' THEN 1 ELSE 0 END,
    search_sessions = search_sessions + CASE WHEN p_game = 'search' THEN 1 ELSE 0 END,
    peak_rating_speed = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_speed, 0), v_speed) ELSE peak_rating_speed END,
    peak_rating_focus = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_focus, 0), v_focus) ELSE peak_rating_focus END,
    peak_rating_spatial = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_spatial, 0), v_spatial) ELSE peak_rating_spatial END,
    peak_rating_logic = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_logic, 0), v_logic) ELSE peak_rating_logic END,
    peak_rating_memory = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(peak_rating_memory, 0), v_memory) ELSE peak_rating_memory END,
    cfop_spatial_record = CASE WHEN p_provenance = 'online' THEN GREATEST(coalesce(cfop_spatial_record, 0), p_round_score) ELSE cfop_spatial_record END
  WHERE id = p_user_id;

  IF p_provenance = 'online' THEN
    UPDATE public.round_tickets
    SET state = 'accepted', completed_at = now(), submitted_at = now()
    WHERE id = p_ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'xpAwarded', v_xp,
    'totalXp', v_old_xp + CASE WHEN p_provenance = 'online' THEN v_xp ELSE 0 END,
    'level', v_new_level,
    'leveledUp', v_new_level > v_old_level,
    'streak', v_streak
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer, integer, integer, integer, timestamptz, text, integer, uuid) TO service_role;

/* -----------------------------------------------------------------------------
   [40/43] File: 20260929000003_phase40_guest_upgrade_states.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- AI Review Phase 40: Guest Upgrade State Machine Fixes

-- 1. Alter upgrade_operations status constraint
ALTER TABLE public.upgrade_operations DROP CONSTRAINT IF EXISTS upgrade_operations_status_check;
ALTER TABLE public.upgrade_operations 
  ADD CONSTRAINT upgrade_operations_status_check 
  CHECK (status IN ('pending_verification', 'email_verified', 'credentials_bound', 'old_sessions_revoked', 'completed', 'failed'));

-- 2. Add expires_at and consumed_at
ALTER TABLE public.upgrade_operations 
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- 3. Fix the trigger logic
-- We should listen for the email change. When the auth.users.email matches the target_email 
-- of a pending upgrade_operation, we advance its state.

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op record;
BEGIN
  -- When the user's email is successfully changed/confirmed, it will match the target_email
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    -- Find the pending operation
    SELECT * INTO v_op FROM public.upgrade_operations 
    WHERE user_id = NEW.id 
      AND status = 'pending_verification'
      AND target_email = NEW.email
      AND expires_at > now();
      
    IF FOUND THEN
      -- Transition to email_verified. 
      -- A backend edge function will handle binding credentials and finalising the upgrade.
      UPDATE public.upgrade_operations 
      SET status = 'email_verified' 
      WHERE id = v_op.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

/* -----------------------------------------------------------------------------
   [41/43] File: 20260929000004_phase41_last_activity_at.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- AI Review: Add last_activity_at for guest cleanup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Update existing profiles where last_active_date exists but is a date (we just cast it or use it as fallback)
UPDATE public.profiles SET last_activity_at = last_active_date::timestamptz WHERE last_activity_at IS NULL;

/* -----------------------------------------------------------------------------
   [42/43] File: 20260929000005_phase42_admin_reset_tx.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
﻿-- AI Review: Make admin_reset_stats increment stats_generation
CREATE OR REPLACE FUNCTION public.admin_reset_stats_tx(
  p_target uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation bigint;
BEGIN
  -- Tang stats_generation và reset các tr?c
  UPDATE public.profiles
  SET
    stats_generation = stats_generation + 1,
    total_xp = 0,
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    gonogo_sessions = 0,
    mental_sessions = 0,
    corsi_sessions = 0,
    trail_sessions = 0,
    search_sessions = 0,
    last_active_date = now(),
    last_activity_at = now()
  WHERE id = p_target
  RETURNING stats_generation INTO v_generation;

  -- Ghi admin audit
  INSERT INTO public.admin_audit (actor_id, target_id, action, details)
  VALUES (p_actor, p_target, 'reset', jsonb_build_object('new_generation', v_generation));
END;
$$;

/* -----------------------------------------------------------------------------
   [43/43] File: 20260929000006_phase43_practice_sessions.sql
   ----------------------------------------------------------------------------- */

SET lock_timeout = '2s';
-- AI Review: Separate offline practice physically
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_round_id uuid UNIQUE NOT NULL,
  game text NOT NULL,
  round_score integer NOT NULL,
  practice_xp_awarded integer NOT NULL DEFAULT 0,
  time_ms integer NOT NULL,
  speed_score integer,
  focus_score integer,
  spatial_score integer,
  logic_score integer,
  memory_score integer,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.submit_offline_practice_tx(
  p_user_id uuid,
  p_client_round_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_time_ms integer,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_practice_xp integer := 0;
  v_xp integer := 0;
BEGIN
  -- Strict idempotency via ON CONFLICT
  INSERT INTO public.practice_sessions (
    user_id, client_round_id, game, round_score, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score,
    occurred_at
  )
  VALUES (
    p_user_id, p_client_round_id, p_game, p_round_score, p_time_ms,
    nullif(p_axes->>'speed','')::integer,
    nullif(p_axes->>'focus','')::integer,
    nullif(p_axes->>'spatial','')::integer,
    nullif(p_axes->>'logic','')::integer,
    nullif(p_axes->>'memory','')::integer,
    p_occurred_at
  )
  ON CONFLICT (client_round_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  -- Practice XP Calculation (max 30 per day, 2 per round)
  v_today_practice_xp := coalesce((
    SELECT sum(practice_xp_awarded) FROM public.practice_sessions
    WHERE user_id = p_user_id 
      AND (recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ), 0);

  IF v_today_practice_xp < 30 THEN
    v_xp := LEAST(2, 30 - v_today_practice_xp);
  ELSE
    v_xp := 0;
  END IF;

  IF v_xp > 0 THEN
    UPDATE public.practice_sessions SET practice_xp_awarded = v_xp WHERE client_round_id = p_client_round_id;
    UPDATE public.profiles SET practice_xp = coalesce(practice_xp, 0) + v_xp WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'practiceXpAwarded', v_xp);
END;
$$;

