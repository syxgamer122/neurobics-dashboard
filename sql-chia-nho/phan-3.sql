-- =============================================================================
-- 20260808_anticheat — Phần 3 — Bảng xếp hạng sạch và RPC cho admin
-- Chạy lần lượt: phần 1 → phần 2 → phần 3. Mỗi phần chạy lại được nhiều lần.
-- =============================================================================

-- 7) BẢNG XẾP HẠNG SẠCH
-- ────────────────────────────────────────────────────────────────────

drop function if exists public.get_leaderboard(integer);
create or replace function public.get_leaderboard(p_limit integer default 25)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where not flagged
  order by cognitive_index desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to authenticated;

drop function if exists public.get_population_stats(integer);
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
    where not flagged
      and (
        coalesce(schulte_sessions, 0)
        + coalesce(sudoku_sessions, 0)
        + coalesce(stroop_sessions, 0)
        + coalesce(reaction_sessions, 0)
        + coalesce(memory_sessions, 0)
        + coalesce(nback_sessions, 0)
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

-- Bảng xếp hạng bạn bè cũng bỏ qua tài khoản bị đánh dấu.
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
    p.cognitive_index,
    p.total_xp,
    p.synapse_streak,
    (p.id = auth.uid()) as is_self
  from public.profiles p
  join circle c on c.uid = p.id
  where auth.uid() is not null
    and not p.flagged
  order by p.cognitive_index desc nulls last
  limit 100;
$$;

revoke all on function public.get_friend_leaderboard() from public, anon;
grant execute on function public.get_friend_leaderboard() to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 8) RPC CHO ADMIN
-- ────────────────────────────────────────────────────────────────────

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
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  return query
  select
    f.id, f.user_id, p.username, f.game, f.reason, f.severity, f.details,
    p.trust_score, p.flagged, f.created_at
  from public.cheat_flags f
  left join public.profiles p on p.id = f.user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_cheat_flags(integer) from public, anon;
grant execute on function public.get_cheat_flags(integer) to authenticated;

-- Admin gỡ oan hoặc khoá thủ công. Gỡ oan thì trả lại điểm tin cậy.
create or replace function public.set_user_flag(
  p_user_id uuid,
  p_flagged boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trust integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  update public.profiles
  set flagged = p_flagged,
      flag_reason = case when p_flagged then p_reason else null end,
      trust_score = case when p_flagged then trust_score else 100 end
  where id = p_user_id
  returning trust_score into v_trust;

  if v_trust is null then
    raise exception 'Profile not found';
  end if;

  return jsonb_build_object('flagged', p_flagged, 'trustScore', v_trust);
end;
$$;

revoke all on function public.set_user_flag(uuid, boolean, text) from public, anon;
grant execute on function public.set_user_flag(uuid, boolean, text) to authenticated;
