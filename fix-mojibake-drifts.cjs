const fs = require('fs');

function fixDrifts() {
    // 1. Version Pinning in version-policy.md
    if (fs.existsSync('docs/version-policy.md')) {
        let content = fs.readFileSync('docs/version-policy.md', 'utf8');
        content = content.replace(/Round đượ[a-zA-Z\?]+ score bằ[a-zA-Z\?]+ version hiệ[a-zA-Z\?]+ tại lú[a-zA-Z\?]+ server xử[a-zA-Z\?]+ lý/gi, 
            'Lưu đầy đủ version trên `round_tickets` khi start-round (`scorer_version`, `inspector_version`, `shared_inspector_version`, `telemetry_schema_version`, `config_version`). Khi submit, dùng chính các version này từ ticket để chấm điểm.');
        content = content.replace(/Round d.*?c score b.*?ng version hi.*?n t.*?i l.*?c server x.*? l.*?/gi, 
            'Lưu đầy đủ version trên `round_tickets` khi start-round (`scorer_version`, `inspector_version`, `shared_inspector_version`, `telemetry_schema_version`, `config_version`). Khi submit, dùng chính các version này từ ticket để chấm điểm.');
        fs.writeFileSync('docs/version-policy.md', content);
    }

    // 2. Guest signup bootstrap password
    if (fs.existsSync('docs/feature_auth_profile.txt')) {
        let content = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
        content = content.replace(/Server g.*?i tr.*?[\r\n]*m.*?t kh.*?u ng.*?u nhi.*?n n.*?y v.*? d.*? client t.*? d.*?ng dang nh.*?p\./g, 
            'Server tạo tài khoản và trả về một bootstrap code ngẫu nhiên (30-60 giây, dùng một lần). Client đổi bootstrap code lấy session qua `/server/guest-session/exchange`. Server chỉ lưu HMAC của code. Mọi response có `Cache-Control: no-store`, không log request/response body.');
        fs.writeFileSync('docs/feature_auth_profile.txt', content);
    }

    // 3. MFA jsonwebtoken
    if (fs.existsSync('docs/adr/0010-admin-mfa.md')) {
        let content = fs.readFileSync('docs/adr/0010-admin-mfa.md', 'utf8');
        content = content.replace(/jsonwebtoken ho.*?c parser tuong duong/g, 'jose.jwtVerify');
        content = content.replace(/1.4 gi.*?/g, 'step-up grant ≤5 phút');
        content = content.replace(/iat c.*?a JWT l.*?m b.*?ng ch.*?ng/g, 'bảng `admin_step_up_grants` làm bằng chứng');
        fs.writeFileSync('docs/adr/0010-admin-mfa.md', content);
    }

    // 4. Offline Rating
    if (fs.existsSync('docs/feature_offline_pwa.txt')) {
        let content = fs.readFileSync('docs/feature_offline_pwa.txt', 'utf8');
        content = content.replace(/C.*?p nh.*?t Rating tr.*?c.*? XP.*? v.*? l.*?ch s.*? v.*?n choi nguy.*?n t.*?\(/g, 
            'INSERT practice_sessions, UPDATE last_activity_at, cấp practice_xp/streak bị giới hạn, enforce idempotency thông qua `UNIQUE (user_id, client_round_id)`, KHÔNG update rating, KHÔNG update competitive total_xp, KHÔNG update PB, KHÔNG mở achievement cạnh tranh (');
        fs.writeFileSync('docs/feature_offline_pwa.txt', content);
    }

    // 5. Scoring Math
    if (fs.existsSync('docs/feature_games_scoring.txt')) {
        let content = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');
        content = content.replace(/1 - lapseRate \* 1\.15/g, 'clamp01(1 - lapseRate * 1.15)');
        content = content.replace(/accuracy \^ 1\.15/g, 'clamp01(accuracy) ^ 1.15');
        content = content.replace(/accuracy \*\* 1\.15/g, 'clamp01(accuracy) ** 1.15');
        content = content.replace(/\(1 - errorRate\) \*\* 1\.2/g, 'Math.pow(clamp01(1 - clamp01(errorRate)), 1.2)');
        fs.writeFileSync('docs/feature_games_scoring.txt', content);
    }
}
fixDrifts();
console.log("Fixes applied");
