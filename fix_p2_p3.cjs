const fs = require('fs');

// Auth Profile edits
let authProf = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
authProf = authProf.replace('F. DATA EXPORT COMPLIANCE', '8.2. DATA EXPORT COMPLIANCE');
authProf = authProf.replace('Cần bổ sung ràng buộc tuổi tối thiểu (ví dụ >= 13 tuổi)', 'Giải pháp đã áp dụng: validate client <= currentYear - 13, DB trigger trg_check_min_age chặn cứng ở tầng cuối.');
authProf = authProf.replace('Lưu profile cơ bản xuống localStorage (cached_profile) để hiển thị nhanh ở lần sau.', 'Đã lưu profile cơ bản xuống localStorage (cached_profile) để hiển thị nhanh ở lần sau (đã có { userId, profile, at }).');
authProf = authProf.replace('Ví dụ: username@neurobics.local', 'Ví dụ: username@mindgem.local');
fs.writeFileSync('docs/feature_auth_profile.txt', authProf);

// Offline PWA edits
let offline = fs.readFileSync('docs/feature_offline_pwa.txt', 'utf8');
offline = offline.replace('Check Profile -> Guest Mode? -> computeProvisionalRoundResult()', 'Check Profile -> computeProvisionalRoundResult()');
fs.writeFileSync('docs/feature_offline_pwa.txt', offline);

// UI Dashboard edits
let ui = fs.readFileSync('docs/feature_ui_dashboard.txt', 'utf8');
ui = ui.replace('History, Quests, Settings có thể bị hạn chế', 'History và Quests bị vô hiệu hoá, Settings chỉ hiển thị các tuỳ chọn cơ bản');
ui = ui.replace(/computeProvisionalRoundResult/g, 'computeProvisionalScore');
fs.writeFileSync('docs/feature_ui_dashboard.txt', ui);

// Admin edits
let admin = fs.readFileSync('docs/feature_admin.txt', 'utf8');
admin = admin.replace(/END \\$\\$;\\n\\n\\n/g, 'END \\$\\$;\\n');
fs.writeFileSync('docs/feature_admin.txt', admin);

// Scoring edits
let scoring = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');
scoring = scoring.replace('logic trong `scoring.ts` cho phép', 'module client (UI-only) `provisional-score.ts` cho phép');
fs.writeFileSync('docs/feature_games_scoring.txt', scoring);

// pushOfflineRound edits (src/app/lib/api/rounds.ts or wherever it is)
let roundsPath = 'src/app/lib/api/rounds.ts';
if (fs.existsSync(roundsPath)) {
  let rounds = fs.readFileSync(roundsPath, 'utf8');
  if (!rounds.includes('TELEMETRY_SCHEMA_VERSION')) {
    rounds = rounds.replace('import { getSupabase', 'import { TELEMETRY_SCHEMA_VERSION } from "../../../../supabase/functions/_shared/scoring/telemetry";\nimport { getSupabase');
  }
  rounds = rounds.replace('schemaVersion: 1', 'schemaVersion: TELEMETRY_SCHEMA_VERSION');
  fs.writeFileSync(roundsPath, rounds);
}
