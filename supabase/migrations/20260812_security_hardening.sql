-- ═══════════════════════════════════════════════════════════════════════════
-- 20260812_security_hardening.sql
-- 1) Tách recovery_code_hash khỏi profiles → bảng chỉ service_role đọc/ghi
-- 2) Thu hẹp SELECT public trên profiles (không lộ hash / cột nhạy cảm)
-- ═══════════════════════════════════════════════════════════════════════════

-- Bảng riêng: client/authenticated KHÔNG bao giờ SELECT được.
create table if not exists public.account_recovery (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.account_recovery enable row level security;
-- Không tạo policy cho authenticated/anon → chỉ service_role (bypass RLS) dùng được.
revoke all on table public.account_recovery from public, anon, authenticated;
grant all on table public.account_recovery to service_role;

-- Di chuyển hash cũ (nếu còn trên profiles) rồi drop cột.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'recovery_code_hash'
  ) then
    insert into public.account_recovery (user_id, code_hash)
    select id, recovery_code_hash
    from public.profiles
    where recovery_code_hash is not null
      and btrim(recovery_code_hash) <> ''
    on conflict (user_id) do update
      set code_hash = excluded.code_hash,
          created_at = now();

    alter table public.profiles drop column recovery_code_hash;
  end if;
end;
$$;

-- Đảm bảo authenticated không update các cột hệ thống nhạy cảm (phòng hờ).
revoke update (
  role, trust_score, flagged, flag_reason,
  algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record,
  total_xp, synapse_streak, last_active_date,
  schulte_sessions, sudoku_sessions, stroop_sessions, reaction_sessions,
  memory_sessions, nback_sessions, math_sessions
) on public.profiles from authenticated, anon;
