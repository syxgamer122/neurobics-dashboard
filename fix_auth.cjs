const fs = require('fs');

// 1. auth.ts
let auth = fs.readFileSync('supabase/functions/server/routes/auth.ts', 'utf8');
auth = auth.replace('import {\\n  adminClient', 'import { AUTH_EMAIL_DOMAIN } from "../../../src/app/lib/api/auth.ts";\nimport {\n  adminClient');
auth = auth.replace(/\`\\$\\{normalized\\}@mindgem\\.local\`/g, '`\\${normalized}@\\${AUTH_EMAIL_DOMAIN}`');
fs.writeFileSync('supabase/functions/server/routes/auth.ts', auth);

// 2. feature_auth_profile.txt (replace all mentions of neurobics.local in text correctly)
let doc = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
doc = doc.replace('Tự động sinh email `${normalized_username}@neurobics.local`', 'Tự động sinh email `${normalized_username}@mindgem.local`');
doc = doc.replace('createUser({ email: username@neurobics.local', 'createUser({ email: username@mindgem.local');
doc = doc.replace('candidate (`username@neurobics.local` trước, `username@neurobics.local` sau)', 'candidate (`username@mindgem.local` trước, `username@neurobics.local` sau)');
doc = doc.replace('Candidate 1: username@neurobics.local', 'Candidate 1: username@mindgem.local');
doc = doc.replace('MÔ HÌNH EMAIL-SPOOFING (@neurobics.local)', 'MÔ HÌNH EMAIL-SPOOFING (@mindgem.local)');
doc = doc.replace('Sử dụng kỹ thuật Email-Spoofing (`username@neurobics.local`)', 'Sử dụng kỹ thuật Email-Spoofing (`username@mindgem.local`)');
fs.writeFileSync('docs/feature_auth_profile.txt', doc);
