-- SINH TU DONG boi tools/baseline-migrations.mjs — dung sua tay.
-- Chay MOT LAN duy nhat, tren project ma schema DA khop voi 35 migration nay.
-- Sau do moi lan deploy chi con: supabase db push (CI da lo).

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);
alter table supabase_migrations.schema_migrations
  add column if not exists statements text[];
alter table supabase_migrations.schema_migrations
  add column if not exists name text;

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
