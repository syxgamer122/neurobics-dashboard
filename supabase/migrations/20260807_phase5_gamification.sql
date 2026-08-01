-- =============================================================================
-- 20260807_phase5_gamification.sql  — GIAI ĐOẠN 5
--
--  1) Game mới N-Back: nới các ràng buộc game + cột nback_sessions
--  2) VÁ LỖ HỔNG: submit_round_transaction chưa bao giờ ghi training_sessions
--     → Lịch sử luôn rỗng. Nay ghi ngay trong cùng transaction.
--  3) Thành tựu (achievements) — xét ở server, không tin client
--  4) Nhiệm vụ ngày (daily quests) + thưởng XP
--  5) Bạn bè + bảng xếp hạng riêng
-- =============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────
-- 1) N-BACK
-- ────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists nback_sessions integer not null default 0;

revoke update (nback_sessions) on public.profiles from authenticated, anon;

-- round_tickets.game
alter table public.round_tickets drop constraint if exists round_tickets_game_check;
alter table public.round_tickets
  add constraint round_tickets_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback'));

-- training_sessions.game
alter table public.training_sessions drop constraint if exists training_sessions_game_check;
alter table public.training_sessions
  add constraint training_sessions_game_check
  check (game in ('schulte','sudoku','stroop','reaction','memory','nback'));

-- xp_events.game: thêm nback + hai nguồn XP phi-ván (quest, achievement)
alter table public.xp_events drop constraint if exists xp_events_game_check;
alter table public.xp_events
  add constraint xp_events_game_check
  check (game in ('schulte','sudoku','stroop','memory','reaction','nback','quest','achievement'));

-- ────────────────────────────────────────────────────────────────────
-- 2) SUBMIT ROUND: thêm nback + GHI training_sessions (vá Lịch sử rỗng)
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
  v_old_xp := coalesce(v_profile.total_xp,0);
  v_old_level := floor((-1 + sqrt(1 + v_old_xp/12.5))/2)::integer + 1;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (p_user_id, p_game, p_round_score, v_xp);
  end if;

  -- LịCH SỬ: trước đây không hề có dòng này nên bảng luôn rỗng.
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

revoke all on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer,text,integer)
  from public, anon, authenticated;
grant execute on function public.submit_round_transaction(uuid,uuid,text,jsonb,integer,text,integer)
  to service_role;

-- ────────────────────────────────────────────────────────────────────
-- 3) THÀNH TỰU
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.user_achievements enable row level security;

drop policy if exists user_achievements_select_own on public.user_achievements;
create policy user_achievements_select_own
  on public.user_achievements for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.user_achievements from authenticated, anon;
grant select on public.user_achievements to authenticated;
grant all on public.user_achievements to service_role;

-- XP thưởng theo mã thành tựu (nguồn sự thật ở server).
create or replace function public.achievement_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    when 'first_round'    then 20
    when 'rounds_10'      then 30
    when 'rounds_50'      then 60
    when 'rounds_100'     then 100
    when 'streak_3'       then 30
    when 'streak_7'       then 60
    when 'streak_30'      then 100
    when 'level_5'        then 40
    when 'level_10'       then 70
    when 'level_20'       then 100
    when 'axis_500'       then 50
    when 'axis_800'       then 100
    when 'all_games'      then 80
    when 'score_900'      then 90
    when 'sudoku_extreme' then 80
    when 'nback_ace'      then 90
    else 0
  end;
$$;

-- Xét lại toàn bộ điều kiện từ dữ liệu thật, mở khoá cái nào chưa có và cộng XP.
create or replace function public.sync_achievements()
returns table (code text, unlocked_at timestamptz, newly_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_rounds bigint;
  v_distinct_games bigint;
  v_best integer;
  v_max_axis integer;
  v_level integer;
  v_has_extreme boolean;
  v_nback_best integer;
  v_new text[] := '{}';
  v_code text;
  v_xp integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_p from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;

  select count(*), count(distinct s.game), coalesce(max(s.round_score),0)
    into v_rounds, v_distinct_games, v_best
  from public.training_sessions s where s.user_id = v_user;

  select coalesce(max(s.round_score),0) into v_nback_best
  from public.training_sessions s where s.user_id = v_user and s.game = 'nback';

  select exists(
    select 1 from public.training_sessions s
    where s.user_id = v_user and s.game = 'sudoku' and s.label = 'Extreme'
  ) into v_has_extreme;

  v_max_axis := greatest(
    coalesce(v_p.speed_score,0), coalesce(v_p.focus_score,0),
    coalesce(v_p.memory_score,0), coalesce(v_p.algebraic_logic_score,0),
    coalesce(v_p.cfop_spatial_record,0)
  );
  v_level := floor((-1 + sqrt(1 + coalesce(v_p.total_xp,0)/12.5))/2)::integer + 1;

  -- Danh sách mã đạt điều kiện
  if v_rounds >= 1   then v_new := v_new || 'first_round'; end if;
  if v_rounds >= 10  then v_new := v_new || 'rounds_10';   end if;
  if v_rounds >= 50  then v_new := v_new || 'rounds_50';   end if;
  if v_rounds >= 100 then v_new := v_new || 'rounds_100';  end if;
  if coalesce(v_p.synapse_streak,0) >= 3  then v_new := v_new || 'streak_3';  end if;
  if coalesce(v_p.synapse_streak,0) >= 7  then v_new := v_new || 'streak_7';  end if;
  if coalesce(v_p.synapse_streak,0) >= 30 then v_new := v_new || 'streak_30'; end if;
  if v_level >= 5  then v_new := v_new || 'level_5';  end if;
  if v_level >= 10 then v_new := v_new || 'level_10'; end if;
  if v_level >= 20 then v_new := v_new || 'level_20'; end if;
  if v_max_axis >= 500 then v_new := v_new || 'axis_500'; end if;
  if v_max_axis >= 800 then v_new := v_new || 'axis_800'; end if;
  if v_distinct_games >= 6 then v_new := v_new || 'all_games'; end if;
  if v_best >= 900 then v_new := v_new || 'score_900'; end if;
  if v_has_extreme then v_new := v_new || 'sudoku_extreme'; end if;
  if v_nback_best >= 700 then v_new := v_new || 'nback_ace'; end if;

  -- Mở khoá những cái chưa có + cộng XP thưởng một lần duy nhất
  foreach v_code in array v_new loop
    if not exists (
      select 1 from public.user_achievements a
      where a.user_id = v_user and a.code = v_code
    ) then
      insert into public.user_achievements(user_id, code) values (v_user, v_code);
      v_xp := public.achievement_xp(v_code);
      if v_xp > 0 then
        insert into public.xp_events(user_id, game, round_score, xp_awarded)
        values (v_user, 'achievement', 0, v_xp);
        update public.profiles set total_xp = coalesce(total_xp,0) + v_xp where id = v_user;
      end if;
    end if;
  end loop;

  return query
    select a.code, a.unlocked_at, (a.unlocked_at > now() - interval '10 seconds')
    from public.user_achievements a
    where a.user_id = v_user
    order by a.unlocked_at desc;
end;
$$;

revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 4) NHIỆM VỤ NGÀY
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.quest_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  quest_day  date not null,
  code       text not null,
  xp_awarded integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_day, code)
);

alter table public.quest_claims enable row level security;

drop policy if exists quest_claims_select_own on public.quest_claims;
create policy quest_claims_select_own
  on public.quest_claims for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.quest_claims from authenticated, anon;
grant select on public.quest_claims to authenticated;
grant all on public.quest_claims to service_role;

create or replace function public.quest_xp(p_code text)
returns integer language sql immutable as $$
  select case p_code
    when 'q_rounds_3'  then 30
    when 'q_score_600' then 40
    when 'q_two_games' then 30
    when 'q_xp_60'     then 20
    else 0
  end;
$$;

-- Tiến độ nhiệm vụ hôm nay (theo ngày Việt Nam), tính từ dữ liệu thật.
create or replace function public.get_daily_quests()
returns table (
  code      text,
  progress  integer,
  goal      integer,
  xp_reward integer,
  claimed   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d
  ),
  s as (
    select *
    from public.training_sessions ts, today
    where ts.user_id = auth.uid()
      and (ts.created_at at time zone 'Asia/Ho_Chi_Minh')::date = today.d
  ),
  x as (
    select coalesce(sum(e.xp_awarded),0)::integer as xp
    from public.xp_events e, today
    where e.user_id = auth.uid()
      and (e.created_at at time zone 'Asia/Ho_Chi_Minh')::date = today.d
  ),
  agg as (
    select
      (select count(*) from s)::integer                                as rounds,
      (select count(*) from s where s.round_score >= 600)::integer     as high,
      (select count(distinct s.game) from s)::integer                  as games,
      (select xp from x)                                               as xp
  ),
  defs as (
    select 'q_rounds_3'::text  as code, least((select rounds from agg), 3) as progress, 3  as goal
    union all select 'q_score_600', least((select high  from agg), 1), 1
    union all select 'q_two_games', least((select games from agg), 2), 2
    union all select 'q_xp_60',     least((select xp    from agg), 60), 60
  )
  select
    d.code,
    d.progress::integer,
    d.goal::integer,
    public.quest_xp(d.code) as xp_reward,
    exists (
      select 1 from public.quest_claims c, today
      where c.user_id = auth.uid() and c.code = d.code and c.quest_day = today.d
    ) as claimed
  from defs d
  order by d.code;
$$;

revoke all on function public.get_daily_quests() from public, anon;
grant execute on function public.get_daily_quests() to authenticated;

-- Nhận thưởng: server tự kiểm tra đủ điều kiện, không tin client.
create or replace function public.claim_quest(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_row record;
  v_xp integer;
  v_total bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_row from public.get_daily_quests() q where q.code = p_code;
  if not found then raise exception 'Unknown quest'; end if;
  if v_row.claimed then raise exception 'Quest already claimed'; end if;
  if v_row.progress < v_row.goal then raise exception 'Quest not completed'; end if;

  v_xp := public.quest_xp(p_code);

  insert into public.quest_claims(user_id, quest_day, code, xp_awarded)
  values (v_user, v_today, p_code, v_xp)
  on conflict do nothing;

  if not found then
    null;
  end if;

  if v_xp > 0 then
    insert into public.xp_events(user_id, game, round_score, xp_awarded)
    values (v_user, 'quest', 0, v_xp);
    update public.profiles set total_xp = coalesce(total_xp,0) + v_xp
    where id = v_user
    returning total_xp into v_total;
  else
    select total_xp into v_total from public.profiles where id = v_user;
  end if;

  return jsonb_build_object('code', p_code, 'xpAwarded', v_xp, 'totalXp', v_total);
end;
$$;

revoke all on function public.claim_quest(text) from public, anon;
grant execute on function public.claim_quest(text) to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 5) BẠN BÈ
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- Một cặp chỉ có một quan hệ, bất kể ai gửi trước.
create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_involved on public.friendships;
create policy friendships_select_involved
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

revoke insert, update, delete on public.friendships from authenticated, anon;
grant select on public.friendships to authenticated;
grant all on public.friendships to service_role;

-- Tìm người chơi theo username (chỉ trả trường công khai).
create or replace function public.search_players(p_query text, p_limit integer default 10)
returns table (id uuid, username text, avatar_url text, cognitive_index double precision)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url, p.cognitive_index
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(coalesce(trim(p_query), '')) >= 2
    and p.username ilike '%' || trim(p_query) || '%'
  order by p.cognitive_index desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

revoke all on function public.search_players(text, integer) from public, anon;
grant execute on function public.search_players(text, integer) to authenticated;

create or replace function public.send_friend_request(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.friendships%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_target is null or p_target = v_user then raise exception 'Invalid target'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'Player not found';
  end if;

  select * into v_existing from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_user, p_target)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_target);

  if found then
    -- Nếu họ đã mời mình trước đó thì coi như chấp nhận luôn.
    if v_existing.status = 'pending' and v_existing.addressee_id = v_user then
      update public.friendships set status = 'accepted', responded_at = now()
      where id = v_existing.id;
      return jsonb_build_object('status', 'accepted');
    end if;
    return jsonb_build_object('status', v_existing.status);
  end if;

  insert into public.friendships(requester_id, addressee_id) values (v_user, p_target);
  return jsonb_build_object('status', 'pending');
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_row from public.friendships where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  -- Chỉ người được mời mới được trả lời.
  if v_row.addressee_id <> v_user then raise exception 'Not your request'; end if;
  if v_row.status <> 'pending' then raise exception 'Request already handled'; end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_request;
    return jsonb_build_object('status', 'accepted');
  end if;

  delete from public.friendships where id = p_request;
  return jsonb_build_object('status', 'declined');
end;
$$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friend(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_user, p_other)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_other);

  return jsonb_build_object('status', 'removed');
end;
$$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Danh sách bạn bè + lời mời (một lần gọi cho cả hai).
create or replace function public.get_friends()
returns table (
  friendship_id uuid,
  player_id     uuid,
  username      text,
  avatar_url    text,
  status        text,
  direction     text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.username,
    p.avatar_url,
    f.status,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by f.status desc, f.created_at desc;
$$;

revoke all on function public.get_friends() from public, anon;
grant execute on function public.get_friends() to authenticated;

-- Bảng xếp hạng riêng: chỉ gồm bạn đã chấp nhận + chính mình.
create or replace function public.get_friend_leaderboard()
returns table (
  id              uuid,
  username        text,
  avatar_url      text,
  cognitive_index double precision,
  total_xp        bigint,
  synapse_streak  integer,
  is_me           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with circle as (
    select auth.uid() as uid
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and auth.uid() in (f.requester_id, f.addressee_id)
  )
  select
    p.id, p.username, p.avatar_url, p.cognitive_index,
    p.total_xp, p.synapse_streak,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  join circle c on c.uid = p.id
  where auth.uid() is not null
  order by p.cognitive_index desc nulls last
  limit 100;
$$;

revoke all on function public.get_friend_leaderboard() from public, anon;
grant execute on function public.get_friend_leaderboard() to authenticated;
