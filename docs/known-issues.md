# Known Issues & Tech Debt

This file is the single source of truth for all known issues and tech debt across the system.

| ID | Severity | Status | Description | Feature |
|---|---|---|---|---|
| KI-1 | P0 | Fixed in Phase 8 | Offline queue chưa gắn userId. Đã xử lý ở Phase 8 bằng cách gắn userId vào offline queue. | feature_offline_pwa.txt |
| KI-2 | P0 | Fixed in Phase 9 | PushOfflineRound client-side validation chưa chặt (cần trần ngày / sync offline limit). Đã chốt API rate limit. | feature_offline_pwa.txt |
| KI-3 | P0 | Fixed in Phase 8 | total_xp có 4 writer không chống lost-update. Đã dùng ledger-based xp_events trong Phase 8. | feature_games_scoring.txt |
| KI-4 | P0 | Fixed in Phase 8 | RLS bị bypass trên bảng profiles. Đã siết lại RLS + Public Leaderboard view. | feature_auth_profile.txt |
| KI-5 | P0 | Fixed in Phase 8 | Thiếu alert engine giám sát latency/pool. Đã triển khai alert-engine function. | feature_observability.txt |
| KI-6 | P0 | Fixed in Phase 8 | Guest bị dọn nhầm khi total_xp = 0. Đã đổi thành kiểm tra NOT EXISTS training_sessions. | data-retention.md |
| KI-7 | P1 | Fixed in Phase 9 | ticket_pool chưa có job reclaim vé quá hạn lâu (3h+). Đã có cronjob dọn vé kẹt. | feature_games_scoring.txt |
| KI-8 | P1 | Fixed in Phase 13 | Bảng quest bị gọi sai (quest_claims vs user_quests) có thể gây lỗi. | feature_gamification.txt |
| KI-9 | P1 | Fixed in Phase 8 | Admin Reset vẫn tự hoàn nguyên. Đã thêm stats_generation để chống reset hoàn nguyên. | feature_admin.txt |
| KI-10 | P1 | Fixed in Phase 8 | Redaction UUID xoá luôn request_id/session_id. Đã whitelist. | feature_observability.txt |
| KI-11 | P2 | Fixed in Phase 13 | Bắt oan Anti-cheat (False Positives): `inspectMemory` chia cho level thay vì taps. `inspectReaction` bấm non 1 lần bị block. | feature_games_scoring.txt |
| KI-12 | P2 | Fixed in Phase 13 | `decayRating` trong `scoring.ts` chưa lưu đỉnh thực tế, dễ gây xói mòn về 0 thay vì giữ sàn 35% đỉnh. | feature_games_scoring.txt |
| KI-13 | P2 | Fixed in Phase 8 | Database Performance: Cần lưu latency histogram thật thay vì average. | feature_observability.txt |
| KI-14 | P2 | Fixed in Phase 14 | Chấm điểm provisional offline làm lộ hằng số anticheat ra bundle client. Nên giấu hoặc bỏ số provisional khi offline. | feature_games_scoring.txt |
| KI-15 | P3 | Fixed in Phase 15 | E2E Offline Sync Testing: Đã có Playwright test mô phỏng ngắt mạng và verify sync. | CI/CD |
| KI-16 | P3 | Open | Dynamic Feature Flags Admin UI: Cần UI Admin bật/tắt `feature_flags`. | feature_admin.txt |
| KI-17 | P3 | Closed | Đã thêm Focus trap, aria-modal, prefers-reduced-motion và Playwright/axe test. | A11y: Thiếu prefers-reduced-motion và focus-trap cho các màn overlay/glassmorphism. | accessibility.md |
| KI-18 | P3 | Fixed in Phase 15 | Brain Age đang so sánh toàn cục, thiếu phân tầng độ tuổi. | feature_games_scoring.txt |
| KI-19 | P3 | Fixed in Phase 9 | Độ phân giải reject rate bị sai lệch khi xoá row. Đã đếm theo count(DISTINCT round_id) và có review_status. | feature_observability.txt |
| KI-20 | P1 | Closed | Backup Restore Drill hoàn tất. Đã kiểm thử phục hồi toàn diện: DB, Auth users/session, Storage, RLS/policies, Edge Functions, pg_cron, Vault/config, Upgrade operations, Outbox, và DNS/application switch. Đạt chỉ tiêu RPO < 24h và RTO < 4h. | runbook.md |
