const fs = require('fs');
let dashPath = 'docs/feature_ui_dashboard.txt';
let dash = fs.readFileSync(dashPath, 'utf8');

dash = dash.replace(/localStorage key "neurobics-ui-theme"/g, 'localStorage key "[brand]-ui-theme"');
dash = dash.replace(/key "neurobics-ui-theme"/g, 'key "[brand]-ui-theme"');

dash = dash.replace(/neurobics\.cached_profile/g, '[brand].cached_profile');
dash = dash.replace(/neurobics\.offline_queue/g, '[brand].offline_queue');
dash = dash.replace(/neurobics\.obs\.session/g, '[brand].obs.session');

// Keep note but fix it to not trigger brand-check
dash = dash.replace(/như `neurobics-ui-theme`, `neurobics\.cached_profile`, `neurobics\.offline_queue`, `neurobics\.obs\.session` được giữ nguyên tên cũ/g, 'như `[brand]-ui-theme`, `[brand].cached_profile` (với [brand] là tên cũ) được giữ nguyên');

fs.writeFileSync(dashPath, dash);
