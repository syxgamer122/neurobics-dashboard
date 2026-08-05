-- ============================================================================
-- SUA BANG SO MIGRATION cho khop voi thu muc supabase/migrations/
--
-- Script nay CHI dung vao bang so supabase_migrations.schema_migrations.
-- KHONG tao/xoa/sua bat ky bang du lieu nao cua ung dung.
--
-- Lam 3 viec:
--   1. Tao bang so neu chua co.
--   2. Danh dau 35 migration trong repo la DA AP DUNG (chot moc).
--   3. Xoa cac dong "mo coi": co tren database nhung khong con file trong repo
--      (vi du 20260729040920) — chinh la thu lam "supabase db push" bao loi
--      "Remote migration versions not found in local migrations directory".
--
-- Chay MOT LAN trong Supabase SQL Editor. Chay lai nhieu lan cung vo hai.
-- ============================================================================

begin;

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);
alter table supabase_migrations.schema_migrations
  add column if not exists statements text[];
alter table supabase_migrations.schema_migrations
  add column if not exists name text;

-- 1) Chot moc: 35 migration trong repo = da ap dung.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260730010000', 'memory_sessions'),
  ('20260730020000', 'signup_security'),
  ('20260730030000', 'xp_system'),
  ('20260731', 'secure_submit_round'),
  ('20260801', 'training_history'),
  ('20260802', 'progress_series'),
  ('20260803', 'profiles_rls_hardening'),
  ('20260804', 'profile_settings'),
  ('20260805', 'leaderboard_popstats'),
  ('20260806', 'role_ticket_activity'),
  ('20260807', 'phase5_gamification'),
  ('20260808', 'anticheat'),
  ('20260809', 'math_game'),
  ('20260811', 'decay_recovery'),
  ('20260812', 'security_hardening'),
  ('20260813', 'cognitive_index_active_axes'),
  ('20260814', 'fix_sync_achievements_array'),
  ('20260815', 'persist_decay_and_coverage'),
  ('20260816', 'ticket_ttl_and_personal_bests'),
  ('20260817', 'drop_legacy_overloads'),
  ('20260818', 'pullup_cold_start'),
  ('20260819', 'restore_float8_wrappers'),
  ('20260820', 'security_identity_hardening'),
  ('20260821', 'bidirectional_rating'),
  ('20260822', 'schulte_config_bests'),
  ('20260823', 'gonogo_game'),
  ('20260824', 'mental_rotation_game'),
  ('20260825', 'achievement_depth'),
  ('20260826', 'quest_depth'),
  ('20260827', 'xp_award_cap_fix'),
  ('20260828', 'quest_titles'),
  ('20260829', 'xp_security_hardening'),
  ('20260830', 'corsi_trail_games'),
  ('20260831', 'rating_reset_v54'),
  ('20260901000000', 'observability')
on conflict (version) do update set name = excluded.name;

-- 2) Don dong mo coi (khong co file tuong ung trong repo).
delete from supabase_migrations.schema_migrations
where version not in (
    '20260730010000',
    '20260730020000',
    '20260730030000',
    '20260731',
    '20260801',
    '20260802',
    '20260803',
    '20260804',
    '20260805',
    '20260806',
    '20260807',
    '20260808',
    '20260809',
    '20260811',
    '20260812',
    '20260813',
    '20260814',
    '20260815',
    '20260816',
    '20260817',
    '20260818',
    '20260819',
    '20260820',
    '20260821',
    '20260822',
    '20260823',
    '20260824',
    '20260825',
    '20260826',
    '20260827',
    '20260828',
    '20260829',
    '20260830',
    '20260831',
    '20260901000000'
  );

commit;

-- 3) Kiem tra: phai ra dung 35 dong, tu 20260730010000 den 20260901000000.
select count(*) as tong_so_migration from supabase_migrations.schema_migrations;
select version, name from supabase_migrations.schema_migrations order by version;
