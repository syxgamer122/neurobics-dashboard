-- Giai đoạn 3: biểu đồ tiến trình theo ngày

-- ── Vá lỗ hổng của Giai đoạn 2 ──
-- get_personal_bests là security definer (bỏ qua RLS) nhưng nhận p_user_id tự
-- do, nghĩa là bất kỳ ai đăng nhập cũng truyền được id người khác để đọc kỷ
-- lục của họ. Thêm điều kiện p_user_id = auth.uid() để chặn.
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
    and p_user_id = auth.uid()
  group by s.game
  order by s.game;
$$;

revoke all on function public.get_personal_bests(uuid) from public, anon;
grant execute on function public.get_personal_bests(uuid) to authenticated, service_role;

-- ── Chuỗi tiến trình theo ngày ──
-- Không nhận user_id từ client: lấy thẳng auth.uid() nên không thể xem trộm
-- người khác. Ngày gộp theo múi giờ Việt Nam, và những ngày không chơi vẫn
-- trả về một dòng rỗng để trục thời gian của biểu đồ không bị co lại.
create or replace function public.get_progress_series(p_days integer default 30)
returns table (
  day        date,
  rounds     bigint,
  xp         bigint,
  avg_score  numeric,
  best_score integer,
  speed      numeric,
  focus      numeric,
  spatial    numeric,
  logic      numeric,
  memory     numeric
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      greatest(1, least(coalesce(p_days, 30), 365))  as span,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date  as today
  ),
  days as (
    select generate_series(
      b.today - (b.span - 1),
      b.today,
      interval '1 day'
    )::date as day
    from bounds b
  ),
  agg as (
    select
      (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
      count(*)                                as rounds,
      sum(s.xp_awarded)                       as xp,
      round(avg(s.round_score)::numeric, 1)   as avg_score,
      max(s.round_score)                      as best_score,
      round(avg(s.speed_score)::numeric, 1)   as speed,
      round(avg(s.focus_score)::numeric, 1)   as focus,
      round(avg(s.spatial_score)::numeric, 1) as spatial,
      round(avg(s.logic_score)::numeric, 1)   as logic,
      round(avg(s.memory_score)::numeric, 1)  as memory
    from public.training_sessions s, bounds b
    where s.user_id = auth.uid()
      and (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date
          between b.today - (b.span - 1) and b.today
    group by 1
  )
  select
    d.day,
    coalesce(a.rounds, 0)::bigint as rounds,
    coalesce(a.xp, 0)::bigint     as xp,
    a.avg_score,
    a.best_score,
    a.speed,
    a.focus,
    a.spatial,
    a.logic,
    a.memory
  from days d
  left join agg a on a.day = d.day
  order by d.day;
$$;

revoke all on function public.get_progress_series(integer) from public, anon;
grant execute on function public.get_progress_series(integer) to authenticated, service_role;
