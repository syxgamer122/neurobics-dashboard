-- SINH TU DONG boi tools/baseline-migrations.mjs — dung sua tay.
-- Chay MOT LAN duy nhat, tren project ma schema DA khop voi 73 migration nay.
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
  ('20260814000000', 'admin_hardening'),
  ('20260814010000', 'engine_versions'),
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
  ('20260901000000', 'observability'),
  ('20260902000000', 'search_game'),
  ('20260903000000', 'offline_idempotency'),
  ('20260904000000', 'data_retention'),
  ('20260905000000', 'phase1_fixes'),
  ('20260905000001', 'phase2_fixes'),
  ('20260905000002', 'phase3_indexes'),
  ('20260905000003', 'phase4_rls'),
  ('20260905000004', 'phase4_reset'),
  ('20260905000005', 'phase5_fixes'),
  ('20260905000006', 'phase6_rate_limits'),
  ('20260905000007', 'phase7_http_metrics'),
  ('20260905000008', 'phase7_feature_flags'),
  ('20260905000009', 'phase8_premint'),
  ('20260906000000', 'phase8_cron_pool'),
  ('20260906000001', 'phase8_admin_reset'),
  ('20260906000002', 'phase8_ledger_xp'),
  ('20260906000003', 'phase8_admin_audit'),
  ('20260906000004', 'phase8_leaderboard'),
  ('20260906000005', 'phase8_histograms'),
  ('20260906000006', 'phase8_audit_rate'),
  ('20260906000007', 'phase8_alert'),
  ('20260906000008', 'phase8_age_gate'),
  ('20260910000000', 'admin_xp_grant'),
  ('20260910000002', 'public_leaderboard'),
  ('20260910000003', 'alert_engine'),
  ('20260910000004', 'stats_epoch'),
  ('20260910000005', 'drop_http_metrics_raw'),
  ('20260910000006', 'ticket_pool_jobs'),
  ('20260910000007', 'reject_rate'),
  ('20260910000009', 'phase10_xp_inflation_quests'),
  ('20260910000010', 'phase10_admin_audit_immutable'),
  ('20260911000000', 'phase11_offline_sync_columns'),
  ('20260911000001', 'phase11_observability_fixes'),
  ('20260918000000', 'phase12_xp_ledger'),
  ('20260918000001', 'phase12_decay_db'),
  ('20260918000002', 'phase12_age_gate')
on conflict (version) do update set name = excluded.name;
