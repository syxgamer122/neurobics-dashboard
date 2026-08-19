-- 20260816_ticket_ttl_and_personal_bests.sql
--
-- Hai sua doi doc lap nhau, gop chung mot migration:
--
--  (1) TTL cua round_tickets vs tran thoi luong van
--      scoreAndValidate chap nhan van dai toi 2 gio (Sudoku timeMs max
--      7_200_000ms), nhung round_tickets.expires_at mac dinh cung dung 2 gio.
--      Bang nhau nghia la KHONG co bien an toan: mot van Sudoku Extreme giai
--      that lau (1h55) cong them do tre mang khi submit se chet o
--      'Round ticket expired' va mat trang cong suc. Nang TTL len 3 gio de
--      luon lon hon tran thoi luong dai nhat.
--
--  (2) get_personal_bests.best_time_ms gop ca van THUA
--      best_time_ms = min(time_ms) tren MOI van. Van thua bo dang luon co
--      thoi gian ngan bat thuong (thua ngay o thu 9/25) nen no chiem cho
--      "Best" va lam con so nay vo nghia. Chi lay min tren van THANG.
--      Van thua duoc danh dau bang hau to '(failed)' trong label
--      (xem scoreSchulte / scoreSudoku ben round-scoring.ts).

set local search_path = public;

-- ---------------------------------------------------------------------------
-- (1) Nang TTL ticket len 3 gio
-- ---------------------------------------------------------------------------

alter table public.round_tickets
  alter column expires_at set default (now() + interval '3 hours');

-- Cac ticket dang mo va con han thi noi them cho du 3 gio ke tu luc tao.
-- Ticket da het han thi de nguyen (khong hoi sinh ticket cu).
update public.round_tickets
set expires_at = started_at + interval '3 hours'
where submitted_at is null
  and expires_at > now()
  and expires_at < started_at + interval '3 hours';

-- ---------------------------------------------------------------------------
-- (2) get_personal_bests: best_time_ms chi tinh tren van thang
-- ---------------------------------------------------------------------------

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
    -- Chi van THANG moi duoc tinh ky luc thoi gian. Van thua co label dang
    -- 'Extreme (failed)' hoac '5x5 (failed)'. Neu nguoi choi chua thang van
    -- nao thi ket qua la NULL (client hien "--" thay vi mot con so sai).
    min(s.time_ms) filter (
      where s.label is null or s.label not ilike '%(failed)%'
    )                                     as best_time_ms,
    round(avg(s.round_score)::numeric, 1) as avg_score,
    sum(s.xp_awarded)                     as total_xp,
    max(s.created_at)                     as last_played_at
  from public.training_sessions s
  where s.user_id = p_user_id
  group by s.game
  order by s.game;
$$;

revoke all on function public.get_personal_bests(uuid) from public, anon;
grant execute on function public.get_personal_bests(uuid) to authenticated, service_role;
