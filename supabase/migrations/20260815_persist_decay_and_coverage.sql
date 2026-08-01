-- ═══════════════════════════════════════════════════════════════════════════
-- 20260815_persist_decay_and_coverage.sql
--
-- (1) NGHIÊM TRỌNG — decay "bốc hơi" sau đúng một ván.
--
--     hydrateProfile() phía client chỉ decay LÚC ĐỌC, không ghi lại. Chuỗi sự
--     kiện thực tế:
--       1. Nghỉ 8 tuần  → mọi trục hiển thị đã decay (600 → 540).
--       2. Chơi một ván Reaction tệ → submit_round_transaction đặt
--          last_active_date = hôm nay, nhưng CHỈ ghi trục được chơi.
--       3. Lần đọc sau: idle_days = 0 → không decay nữa → Logic/Memory/Spatial
--          (không hề chơi) nhảy về đỉnh 600 nguyên vẹn.
--
--     Vì apply_round_rating() là upward-only, không gì kéo chúng xuống được.
--     Cách sửa: TRƯỚC khi tính rating mới, lấy baseline đã decay cho CẢ 5 TRỤC
--     rồi persist toàn bộ — kể cả trục không chơi trong ván này.
--
-- (2) Cognitive index thiên vị coverage thấp: trung bình trên riêng trục > 0
--     khiến người chỉ chơi Sudoku (Logic 800) đứng trên người đủ 5 trục (700).
--     Áp shrinkage theo độ phủ, khớp cognitiveIndex() bên client.
-- ═══════════════════════════════════════════════════════════════════════════

set local search_path = public;

-- ─── 1) submit_round_transaction: decay baseline cả 5 trục rồi persist ──────
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
begin
  if p_game not in ('schulte','sudoku','stroop','reaction','memory','nback','math') then
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

  -- ── Baseline đã decay cho CẢ 5 trục ──────────────────────────────────────
  -- Đây là mấu chốt: ván này sắp ghi last_active_date = hôm nay, nên nếu
  -- không hạ các trục xuống NGAY BÂY GIỜ thì thời gian nghỉ vừa qua sẽ biến
  -- mất vĩnh viễn khỏi hồ sơ.
  v_idle := public.idle_days_vn(v_profile.last_active_date);

  v_base_speed   := public.decay_rating(coalesce(v_profile.speed_score, 0),           v_idle);
  v_base_focus   := public.decay_rating(coalesce(v_profile.focus_score, 0),           v_idle);
  v_base_spatial := public.decay_rating(coalesce(v_profile.cfop_spatial_record, 0),   v_idle);
  v_base_logic   := public.decay_rating(coalesce(v_profile.algebraic_logic_score, 0), v_idle);
  v_base_memory  := public.decay_rating(coalesce(v_profile.memory_score, 0),          v_idle);

  -- Trục có điểm ván này: kéo lên từ baseline ĐÃ DECAY.
  -- Trục không chơi: vẫn ghi baseline đã decay (trước đây giữ nguyên đỉnh cũ).
  v_speed   := case when p_axes ? 'speed'   then public.apply_round_rating(v_base_speed,   (p_axes->>'speed')::integer)   else v_base_speed end;
  v_focus   := case when p_axes ? 'focus'   then public.apply_round_rating(v_base_focus,   (p_axes->>'focus')::integer)   else v_base_focus end;
  v_spatial := case when p_axes ? 'spatial' then public.apply_round_rating(v_base_spatial, (p_axes->>'spatial')::integer) else v_base_spatial end;
  v_logic   := case when p_axes ? 'logic'   then public.apply_round_rating(v_base_logic,   (p_axes->>'logic')::integer)   else v_base_logic end;
  v_memory  := case when p_axes ? 'memory'  then public.apply_round_rating(v_base_memory,  (p_axes->>'memory')::integer)  else v_base_memory end;

  v_streak := case
    when v_profile.last_active_date = v_today then coalesce(v_profile.synapse_streak, 0)
    when v_profile.last_active_date = v_today - 1 then coalesce(v_profile.synapse_streak, 0) + 1
    else 1
  end;

  select coalesce(sum(xp_awarded), 0)::integer into v_today_xp
  from public.xp_events
  where user_id = p_user_id
    and created_at >= (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and created_at <  ((v_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');

  v_xp := greatest(0, least(100, round(p_round_score / 10.0)::integer));
  if coalesce(v_profile.flagged, false) then
    v_xp := 0;
  elsif v_today_xp + v_xp > 500 then
    v_xp := greatest(0, 500 - v_today_xp);
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
    math_sessions     = math_sessions     + case when p_game='math'     then 1 else 0 end,
    synapse_streak = v_streak,
    last_active_date = v_today,
    total_xp = v_old_xp + v_xp
  where id = p_user_id
  returning * into v_profile;

  update public.round_tickets set submitted_at = now() where id = p_ticket_id;
  v_new_level := floor((-1 + sqrt(1 + v_profile.total_xp/12.5))/2)::integer + 1;

  return jsonb_build_object(
    'profile',     to_jsonb(v_profile),
    'xpAwarded',   v_xp,
    'totalXp',     v_profile.total_xp,
    'level',       v_new_level,
    'leveledUp',   v_new_level > v_old_level,
    -- Hữu ích cho UI: cho biết ván này vừa "chốt sổ" bao nhiêu ngày nghỉ.
    'decayedDays', v_idle
  );
end;
$$;

revoke all on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_round_transaction(uuid, uuid, text, jsonb, integer, text, integer)
  to service_role;

-- ─── 2) Cognitive index: shrinkage theo độ phủ ──────────────────────────────
-- raw * (0.4 + 0.6 * covered/5). Khớp COVERAGE_FLOOR trong src/app/lib/api.ts.
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
  ),
  -- Xét trục "đã có dữ liệu" theo điểm THÔ (trước decay). Nếu xét sau decay,
  -- một trục bị decay về 0 sẽ tự biến mất khỏi mẫu số và làm index tăng ngược.
  axes as (
    select *
    from (
      values
        (coalesce(p_logic, 0)),
        (coalesce(p_memory, 0)),
        (coalesce(p_speed, 0)),
        (coalesce(p_focus, 0)),
        (coalesce(p_spatial, 0))
    ) as v(raw)
  ),
  active as (
    select public.decay_rating(a.raw, d.idle) as decayed
    from axes a
    cross join d
    where a.raw > 0
  ),
  agg as (
    select avg(decayed) as raw_avg, count(*)::double precision as covered
    from active
  )
  select coalesce(
    raw_avg * (0.4 + 0.6 * (covered / 5.0)),
    0
  )::double precision
  from agg;
$$;

revoke all on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  from public, anon;
grant execute on function public.decayed_cognitive_index(numeric, numeric, numeric, numeric, numeric, date)
  to authenticated, service_role;

-- Tính lại cột cognitive_index nếu nó là cột thường (không phải generated).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'cognitive_index'
      and is_generated = 'NEVER'
  ) then
    update public.profiles
    set cognitive_index = public.decayed_cognitive_index(
      algebraic_logic_score,
      memory_score,
      speed_score,
      focus_score,
      cfop_spatial_record,
      last_active_date
    );
    raise notice 'profiles.cognitive_index recomputed with coverage shrinkage';
  else
    raise notice 'profiles.cognitive_index is generated or absent; nothing to backfill';
  end if;
end $$;
