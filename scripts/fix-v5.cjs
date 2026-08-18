const fs = require('fs');
const path = require('path');
const DOCS_DIR = path.join(process.cwd(), 'docs');

function update(file, replacements) {
    const p = path.join(DOCS_DIR, file);
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');
    let changed = false;
    for (let r of replacements) {
        if (c.match(r.search)) {
            c = c.replace(r.search, r.replace);
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(p, c);
        console.log("Updated", file);
    } else {
        console.log("No match found in", file);
    }
}

// 1. Version Pinning (version-policy.md)
update('version-policy.md', [
    { search: /Bốn version constant/g, replace: 'Năm version constant (bao gồm CONFIG_VERSIONS)' },
    { search: /luôn dùng version trên ticket/g, replace: 'luôn dùng version trên ticket thông qua Registry Code bất biến (ví dụ: `SCORERS_BY_VERSION`). Hàm `getScorer(game, version)` sẽ throw lỗi nếu không tìm thấy code cũ, đảm bảo kết quả có thể tái lập hoàn toàn (test:version-pinning).' }
]);

// 2 & 3. RLS, Guest Upgrade, SSOT (feature_auth_profile.txt)
update('feature_auth_profile.txt', [
    { search: /auth\.uid\(\) = id/g, replace: 'Các RPC SECURITY DEFINER (như `update_my_birth_year()`). Quyền UPDATE trực tiếp trên bảng `profiles` bị REVOKE hoàn toàn khỏi role Authenticated để ngăn chặn leo thang đặc quyền (không thể sửa role, total_xp).' },
    { search: /supabase\.auth\.updateUser/g, replace: 'RPC `finalize_guest_upgrade_tx` (xem ADR-0009 SSOT)' }
]);

// 3. Guest Upgrade (architecture-contracts.md & adr/0009)
update('architecture-contracts.md', [
    { search: /Nâng cấp Guest/g, replace: 'Nâng cấp Guest (SSOT: ADR-0009, cấm dùng updateUser trực tiếp)' }
]);

update('adr/0009-guest-account-upgrade.md', [
    { search: /tự động thăng cấp/g, replace: 'Email thay đổi KHÔNG BAO GIỜ tự động thăng cấp role. Việc thăng cấp chỉ diễn ra qua RPC `finalize_guest_upgrade_tx` có khóa `FOR UPDATE` và đối chiếu session.' }
]);

// 4. Privacy Matrix (privacy-and-terms.md)
update('privacy-and-terms.md', [
    { search: /Hệ thống cung cấp bảng `user_consents`/g, replace: 'Data-Processing Matrix: \n| Mục đích | Dữ liệu | Cơ sở pháp lý | Lưu trữ | Khi rút quyền |\n|---|---|---|---|---|\n| Chơi game | Telemetry | Hợp đồng | Vĩnh viễn | N/A |\n| Brain Age | Thống kê | Explicit Consent | Khi rút | Dừng tính |\n| Anti-cheat | Tín hiệu | Lợi ích hợp pháp | 90 ngày | Review |\n\nHệ thống cung cấp bảng `user_consents`' },
    { search: /Export Data cung cấp đầy đủ/g, replace: 'Export Data API xuất toàn bộ Manifest: profile, telemetry, tickets, ledgers, consents, avatar metadata, và cheat_flags (đã pseudonymized).' }
]);

// 5. Runbook (runbook.md)
update('runbook.md', [
    { search: /PITR in-place/g, replace: 'PITR in-place (yêu cầu báo cáo Drill hàng quý: phục hồi Storage object bytes, DNS, Cron, cấu hình Vault, và đối chiếu Checksum. Không chỉ dựa vào lý thuyết PITR của Postgres).' }
]);

// 6. Admin Idempotency (feature_admin.txt)
update('feature_admin.txt', [
    { search: /Transaction nguyên tử/g, replace: 'Bảng `admin_operations` (actor_id, idempotency_key) khóa giao dịch nguyên tử' }
]);

// 7 & 8. Scoring & Active Tickets (feature_games_scoring.txt)
update('feature_games_scoring.txt', [
    { search: /UNIQUE\(user_id, game, state='issued'\)/g, replace: 'Partial Unique Index `(user_id, client_session_id)` giới hạn tối đa 3 ticket cho một người dùng.' },
    { search: /tính điểm Elo/g, replace: 'tính điểm Robust Rolling Rating' }
]);

// 8. Gamification Math (feature_gamification_social.txt)
update('feature_gamification_social.txt', [
    { search: /900/g, replace: '850' } // Rough downgrade of achievements
]);

// 9 & 12. Anti-cheat & Observability (feature_anticheat_observability.txt)
update('feature_anticheat_observability.txt', [
    { search: /Soft Reject/g, replace: 'Đóng băng Pipeline xử lý: Invariant -> Chuẩn hóa -> Tín hiệu -> Quyết định. Hard Reject YÊU CẦU ≥2 tín hiệu thống kê ĐỘC LẬP hoặc 1 tín hiệu vật lý. Rule mới bắt buộc qua Shadow Mode.\nSoft Reject' },
    { search: /vault \+ outbox/g, replace: 'Observability ghi qua Async Fail-open queue (Logflare/Datadog) để chống Failure Coupling làm sập DB chính.\nSử dụng vault + outbox' }
]);

// 10. Offline Queue (feature_offline_pwa.txt)
update('feature_offline_pwa.txt', [
    { search: /xóa ván cũ/g, replace: 'Từ chối (reject) round mới thay vì silent eviction khi queue đầy.' },
    { search: /offline_stale và cấp `XP = 0`/g, replace: 'offline_stale và cấp `XP = 0` (Stale rounds KHÔNG được tính vào Streak, Quests, và XP). Lease Web Locks phải được tự động gia hạn.' }
]);

// 11. Availability SQL (monitoring-alerts.md)
update('monitoring-alerts.md', [
    { search: /AS success_rate_pct;/g, replace: 'AS success_rate_pct' }
]);

console.log("V5 fixes script executed.");
