const fs = require('fs');
let dashPath = 'docs/feature_ui_dashboard.txt';
let dash = fs.readFileSync(dashPath, 'utf8');

dash = dash.replace(/`"neurobics-ui-theme"`/g, '`"[brand]-ui-theme"`');
dash = dash.replace(/`neurobics-ui-theme`/g, '`[brand]-ui-theme`');

fs.writeFileSync(dashPath, dash);
