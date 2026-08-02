-- =============================================================================
-- sql-chia-nho/phan-3.sql  —  ĐÃ VÔ HIỆU HÓA (KHÔNG CHẠY FILE NÀY)
-- =============================================================================
-- Lịch sử: file này từng là bản rút gọn của 20260808_anticheat (phần leaderboard
-- + RPC admin). Nó TẠO LẠI get_leaderboard / get_population_stats /
-- get_friend_leaderboard theo cognitive_index thô, KHÔNG decay, và có thể ghi
-- đè các bản đã vá sau này (20260811_decay_recovery, 20260815, 20260819...).
--
-- Chạy nhầm file này = bảng xếp hạng / tuổi não lệch lại như trước khi vá.
--
-- Nguồn đúng hiện tại nằm trong:
--   supabase/migrations/20260811_decay_recovery.sql
--   supabase/migrations/20260815_persist_decay_and_coverage.sql
--   supabase/migrations/20260808_anticheat.sql  (get_cheat_flags, set_user_flag)
--   supabase/migrations/20260819_restore_float8_wrappers.sql
--   supabase/migrations/20260820_security_identity_hardening.sql
--
-- Nếu cần chạy lại leaderboard sạch + admin RPC, dùng migration gốc ở trên,
-- KHÔNG dùng bản chia nhỏ này.
-- =============================================================================

do $$
begin
  raise exception
    'sql-chia-nho/phan-3.sql da vo hieu hoa. Dung supabase/migrations/* (20260811+). Xem header file.';
end $$;
