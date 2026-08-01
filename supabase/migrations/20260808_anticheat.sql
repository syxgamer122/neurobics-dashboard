-- =============================================================================
-- 20260808_anticheat.sql
-- Giai đoạn 6 — Chống gian lận.
--  1) Cột tin cậy trên profiles (trust_score / flagged)
--  2) Bảng cheat_flags — nhật ký nghi vấn do server ghi
--  3) Bảng device_links — phát hiện nhiều tài khoản dùng chung một máy
--  4) submit_round_transaction: thêm giới hạn tần suất + không cộng XP cho
--     tài khoản đã bị đánh dấu
--  5) Bảng xếp hạng và thống kê dân số loại bỏ tài khoản bị đánh dấu
--  6) RPC cho admin xem và xử lý nghi vấn
-- Chạy lại nhiều lần vẫn an toàn.
-- =============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────
-- 1) CỘT TIN CẬY
-- ────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists trust_score integer not null default 100;

alter table public.profiles
  add column if not exists flagged boolean not null default false;

alter table public.profiles
  add column if not exists flag_reason text;

alter table public.profiles drop constraint if exists profiles_trust_score_check;
alter table public.profiles
  add constraint profiles_trust_score_check
  check (trust_score between 0 and 100);

-- Người chơi tuyệt đối không được tự sửa ba cột này.
revoke update (trust_score, flagged, flag_reason)
  on public.profiles from authenticated, anon;

create index if not exists profiles_flagged_idx
  on public.profiles (flagged) where flagged;

-- ────────────────────────────────────────────────────────────────────
-- 2) NHẬT KÝ NGHI VẤN
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.cheat_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text,
  reason text not null,
  severity text not null default 'soft',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cheat_flags drop constraint if exists cheat_flags_severity_check;
alter table public.cheat_flags
  add constraint cheat_flags_severity_check
  check (severity in ('soft', 'hard'));

create index if not exists cheat_flags_user_idx
  on public.cheat_flags (user_id, created_at desc);

create index if not exists cheat_flags_created_idx
  on public.cheat_flags (created_at desc);

alter table public.cheat_flags enable row level security;

-- Chỉ admin được đọc. Người chơi không nhìn thấy để không dò ra ngưỡng phát hiện.
drop policy if exists cheat_flags_admin_select on public.cheat_flags;
create policy cheat_flags_admin_select on public.cheat_flags
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Không cấp insert/update/delete cho ai: chỉ service_role qua RPC bên dưới.

-- ────────────────────────────────────────────────────────────────────
-- 3) LIÊN KẾT THIẾT BỊ
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count integer not null default 1
);

create unique index if not exists device_links_pair_uidx
  on public.device_links (user_id, fingerprint);

create index if not exists device_links_fingerprint_idx
  on public.device_links (fingerprint);

alter table public.device_links enable row level security;
-- Không policy nào: chỉ service_role đọc ghi được.

-- ────────────────────────────────────────────────────────────────────
-- 4) GHI NGHI VẤN
-- ────────────────────────────────────────────────────────────────────

-- Trừ điểm tin cậy theo mức độ. Xuống dưới 40 thì tự đánh dấu tài khoản.
create or replace function public.record_cheat_flag(
  p_user_id uuid,
  p_game text,
  p_reason text,
  p_severity text default 'soft',
  p_details jsonb default '{}'::jsonb
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

  insert into public.cheat_flags(user_id, game, reason, severity, details)
  values (p_user_id, nullif(p_game, ''), p_reason, p_severity,
          coalesce(p_details, '{}'::jsonb));

  v_penalty := case when p_severity = 'hard' then 25 else 8 end;

  update public.profiles
  set trust_score = greatest(0, trust_score - v_penalty)
  where id = p_user_id
  returning trust_score into v_trust;

  if v_trust is null then
    return jsonb_build_object('trustScore', null, 'flagged', false);
  end if;

  -- Ngưỡng 40: dưới mức này coi như cần xem xét thủ công.
  if v_trust < 40 then
    update public.profiles
    set flagged = true,
        flag_reason = coalesce(flag_reason, p_reason)
    where id = p_user_id and not flagged;
  end if;

  select flagged into v_flagged from public.profiles where id = p_user_id;

  return jsonb_build_object('trustScore', v_trust, 'flagged', coalesce(v_flagged, false));
end;
$$;

revoke all on function public.record_cheat_flag(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_cheat_flag(uuid, text, text, text, jsonb)
  to service_role;

-- ────────────────────────────────────────────────────────────────────
-- 5) GHI NHẬN THIẾT BỊ + PHÁT HIỆN ĐA TÀI KHOẢN
-- ────────────────────────────────────────────────────────────────────

-- Trả về số tài khoản khác đang dùng chung dấu vân thiết bị này.
create or replace function public.link_device(
  p_user_id uuid,
  p_fingerprint text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_others integer;
begin
  if p_fingerprint is null or length(trim(p_fingerprint)) < 8 then
    return 0;
  end if;

  insert into public.device_links(user_id, fingerprint)
  values (p_user_id, p_fingerprint)
  on conflict (user_id, fingerprint) do update
    set last_seen = now(),
        seen_count = public.device_links.seen_count + 1;

  select count(distinct user_id)::integer into v_others
  from public.device_links
  where fingerprint = p_fingerprint and user_id <> p_user_id;

  -- Cùng nhà dùng chung máy là chuyện bình thường, nên chỉ ghi nghi vấn
  -- khi vượt quá 3 tài khoản khác trên cùng một thiết bị.
  if v_others > 3 then
    perform public.record_cheat_flag(
      p_user_id, null, 'Nhiều tài khoản dùng chung một thiết bị', 'soft',
      jsonb_build_object('otherAccounts', v_others)
    );
  end if;

  return coalesce(v_others, 0);
end;
$$;

revoke all on function public.link_device(uuid, text)
  from public, anon, authenticated;
grant execute on function public.link_device(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────────
-- 6) SUBMIT ROUND: GIỚI HẠN TẦN SUẤT + TÀI KHOẢN BỊ ĐÁNH DẤU
-- ────────────────────────────────────────────────────────────────────

create or replace function public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.round_tickets%rowtype;
  v_profile public.profiles%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_streak integer;
  v_today_xp integer := 0;
  v_xp integer := 0;
  v_old_xp bigint;
  v_old_level integer;
  v_new_level integer;
  v_speed integer;
  v_focus integer;
  v_spatial integer;
  v_logic integer;
  v_memory integer;
  v_recent integer;
begin
  if p_game not in ('schulte','sudoku','stroop','reaction','memory','nback') then
    raise exception 'Invalid game';
  end if;
  if p_round_score < 0 or p_round_score > 1000 then
    raise exception 'Invalid round score';
  end if;

  select * into v_ticket from public.round_tickets where id = p_ticket_id for update;
  if not found or v_ticket.user_id <> p_user_id or v_ticket.game <> p_game then
    raise exception 'Invalid round ticket';
  end if;
  if v_ticket.submitted_at is not null then raise exception 'Round already submitted'; end if;
  if v_ticket.expires_at < now() then raise exception 'Round ticket expired'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  -- GIỚI HẠN TẦN SUẤT: người thật không thể nộp quá 40 ván trong một giờ.
  select count(*)::integer into v_recent
  from public.training_sessions s
  where s.user_id = p_user_id and s.created_at > now() - interval '1 hour';

  if v_recent >= 40 then
    perform public.record_cheat_flag(
      p_user_id, p_game, 'Nộp quá nhiều ván trong một giờ', 'hard',
      jsonb_build_object('roundsLastHour', v_recent)
    );
    raise exception 'Rate limit exceeded';
  end if;

  v_speed   := case when p_axes ? 'speed'   then public.apply_round_rating(coalesce(v_profile.speed_score,0),          (p_axes->>'speed')::integer)   else v_profile.speed_score end;
  v_focus   := case when p_axes ? 'focus'   then public.apply_round_rating(coalesce(v_profile.focus_score,0),          (p_axes->>'focus')::integer)   else v_profile.focus_score end;
  v_spatial := case when p_axes ? 'spatial' then public.apply_round_rating(coalesce(v_profile.cfop_spatial_record,0),  (p_axes->>'spatial')::integer) else v_profile.cfop_spatial_record end;
  v_logic   := case when p_axes ? 'logic'   then public.apply_round_rating(coalesce(v_profile.algebraic_logic_score,0),(p_axes->>'logic')::integer)   else v_profile.algebraic_logic_score end;
  v_memory  := case when p_axes ? 'memory'  then public.apply_round_rating(coalesce(v_profile.memory_score,0),         (p_axes->>'memory')::integer)  else v_profile.memory_score end;

  if v_profile.last_active_date is null then v_streak := 1;
  elsif v_profile.last_active_date = v_today then v_streak := v_profile.synapse_streak;
  elsif v_profile.last_active_date = v_today - 1 then v_streak := v_profile.synapse_streak + 1;
  else v_streak := 1;
  end if;

  select coalesce(sum(e.xp_awarded),0)::integer into v_today_xp
  from public.xp_events e
  where e.user_id = p_user_id
    and (e.created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_today;

  v_xp := greatest(0, least(35, 15 + floor(p_round_score/50.0)::integer, 300 - v_today_xp));

  -- Tài khoản đang bị đánh dấu vẫn chơi và lưu lịch sử được, nhưng không
  -- nhận XP, nên không leo được bảng xếp hạng trong lúc chờ xem xét.
  if v_profile.flagged then
    v_xp := 0;
  end if;

  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (p_user_id, p_game, p_round_score, v_xp);
  end if;

  insert into public.training_sessions(
    user_id, game, label, round_score, xp_awarded, time_ms,
    speed_score, focus_score, spatial_score, logic_score, memory_score
  ) values (
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
    nullif(p_axes->>'memory','')::integer
  );

  update public.profiles set
    speed_score = v_speed,
    focus_score = v_focus,
    cfop_spatial_record = v_spatial,
    algebraic_logic_score = v_logic,
    memory_score = v_memory,
    schulte_sessions  = schulte_sessions  + case when p_game='schulte'  then 1 else 0 end,
    sudoku_sessions   = sudoku_sessions   + case when p_game='sudoku'   then 1 else 0 end,
    stroop_sessions   = stroop_sessions   + case when p_game='stroop'   then 1 else 0 end,
    reaction_sessions = reaction_sessions + case when p_game='reaction' then 1 else 0 end,
    memory_sessions   = memory_sessions   + case when p_game='memory'   then 1 else 0 end,
    nback_sessions    = nback_sessions    + case when p_game='nback'    then 1 else 0 end,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  where id = p_user_id
  returning * into v_profile;

  update public.round_tickets set submitted_at = now() where id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  return jsonb_build_object(
    'profile',   to_jsonb(v_profile),
    'xpAwarded', v_xp,
    'totalXp',   v_profile.total_xp,
    'level',     v_new_level,
    'leveledUp', v_new_level > v_old_level
  );
end;
$$;

revoke all on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  to service_role;

-- ────────────────────────────────────────────────────────────────────
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
