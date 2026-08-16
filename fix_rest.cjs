const fs = require('fs');

// 1. feature_anticheat_observability.txt
let antiPath = 'docs/feature_anticheat_observability.txt';
if (fs.existsSync(antiPath)) {
  let anti = fs.readFileSync(antiPath, 'utf8');
  anti = anti.replace(/Cỡ mẫu N < 3/g, 'N < 3');
  fs.writeFileSync(antiPath, anti);
}

// 2. feature_ui_dashboard.txt age gate UI doc update
let uiPath = 'docs/feature_ui_dashboard.txt';
if (fs.existsSync(uiPath)) {
  let ui = fs.readFileSync(uiPath, 'utf8');
  // Age gate updates were done but verify
  ui = ui.replace(/1900 -> năm hiện tại/g, 'năm hiện tại - 13');
  ui = ui.replace(/1900 <= year <= new Date\(\)\.getFullYear\(\)/g, 'year <= new Date().getFullYear() - 13');
  
  // Origin check for iframe
  ui = ui.replace(/window\.addEventListener\("message", \(e\) => \{/g, 'window.addEventListener("message", (e) => {\n      if (e.origin !== window.location.origin) return;');
  
  // ui 6.1 god mode
  ui = ui.replace(/với non-admin, vừa nói non-admin bấm "god" sẽ thấy AccessDeniedOverlay/g, 'với non-admin (nếu cố tình bấm "god" sẽ thấy AccessDeniedOverlay)');
  fs.writeFileSync(uiPath, ui);
}

// 3. gamification idempotent
let sqlPath = 'supabase/migrations/20260910000009_phase10_xp_inflation_quests.sql';
if (fs.existsSync(sqlPath)) {
  let sql = fs.readFileSync(sqlPath, 'utf8');
  sql = sql.replace(
    /INSERT INTO public\.xp_events\(user_id, game, round_score, xp_awarded\)/g, 
    "INSERT INTO public.xp_events(user_id, game, round_score, xp_awarded, source_key)"
  );
  sql = sql.replace(
    /VALUES \(v_user, 'achievement', 0, v_xp\);/g,
    "VALUES (v_user, 'achievement', 0, v_xp, 'achievement_' || v_code);"
  );
  fs.writeFileSync(sqlPath, sql);
}

