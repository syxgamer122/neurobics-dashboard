const fs = require('fs');

// 1. Fix feature_auth_profile.txt
let authDoc = fs.readFileSync('docs/feature_auth_profile.txt', 'utf8');
authDoc = authDoc.replace(
  /export const AUTH_EMAIL_DOMAIN = "neurobics\.local";\r?\nexport const LEGACY_AUTH_EMAIL_DOMAIN = "neurobics\.local";/g,
  export const AUTH_EMAIL_DOMAIN = "mindgem.local";
export const LEGACY_AUTH_EMAIL_DOMAINS = ["neurobics.local"] as const;

function authEmailCandidates(username: string): string[] {
  const name = assertValidUsername(username);
  return [AUTH_EMAIL_DOMAIN, ...LEGACY_AUTH_EMAIL_DOMAINS].map((d) => \\@\\);
}
);
fs.writeFileSync('docs/feature_auth_profile.txt', authDoc);
