const fs = require('fs');
let content = fs.readFileSync('docs/adr/0010-admin-mfa.md', 'utf8');

content = content.replace(/xác minh nghiêm ng?t token JWT b?ng \jose\.jwtVerify\[\s\S]*?t?i da 5 phút/,
\Verify signature b?ng JWKS -> verify issuer -> verify audience -> verify expiry -> verify subject -> require aal2 -> require recent step-up <= 5 phút -> require capability.

- Tách bi?t TTL: Phiên xem dashboard (d?c admin) có th? s?ng lâu hon, nhung các thao tác nguy hi?m (grant, reset, delete) yêu c?u auth_time (recent step-up) t?i da 5 phút.\);

content = content.replace(/C?n có \AppErrorStatus\ d?y d? \(400.*?429\) d? client chuy?n hu?ng\./, 
\C?n có AppErrorStatus rõ ràng d? client t? d?ng x? lý chuy?n hu?ng:
\\\\\\\\\	s
type AppErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 413
  | 422
  | 429;
\\\\\\\\\\);

fs.writeFileSync('docs/adr/0010-admin-mfa.md', content, 'utf8');
