const fs = require('fs');
let content = fs.readFileSync('docs/feature_games_scoring.txt', 'utf8');

content = content.replace(/Server tr\?\s*v\?\s*\{ roundId, game, startedAt, expiresAt \} \(th\?\?i gian s\?
g 3 gi\?\?\)/, 
\Server tr? v? { roundId, game, challengeConfig, configVersion, startedAt, expiresAt } (th?i gian s?ng 3 gi?)

[BU?C 1.5: TH?C THI B?I CLIENT]
- Client th?c thi game d?a trên challengeConfig nh?n du?c (KHÔNG du?c quy?n t? ch?n d? khó/c?u hình).\);

content = content.replace(/Server g?i \scoreAndValidate\.*?:/, 
\Server g?i scoreAndValidate(game, ticket.challengeConfig, telemetry):
   - Server tuy?t d?i b? qua các tham s? d? khó/c?u hình do client khai trong telemetry. M?i d?u vào liên quan d?n difficulty, n, trials, angles, mirrors, span d?u l?y t? ticket.challengeConfig (t?o b?i Server).\);

// Also fix clamping logic for N-Back, Corsi, Mental Rotation
content = content.replace(/accuracy = clamp01\(hitRate - faRate \* 0\.95\)/, \safeFaRate = clamp01(faRate), accuracy = clamp01(hitRate - safeFaRate * 0.95)\);
content = content.replace(/spanNorm = clamp01\(\(span - 2\) \/ 6\)/, \safeErrorRate = clamp01(errorRate), spanNorm = clamp01((span - 2) / 6)\);
content = content.replace(/Memory: \clamp\(MAX \* 0\.95 \* spanFactor\(0\.65\) \* \(0\.7 \+ 0\.3 \* accuracy\)\)\/g, \Memory: clamp(MAX * 0.95 * spanFactor(0.65) * (0.7 + 0.3 * clamp01(accuracy)))\);
content = content.replace(/Spatial: \clamp\(MAX \* 0\.84 \* spanFactor\(0\.6\) \* \(\(1 - errorRate\) \^ 1\.2\)\)\/g, \Spatial: clamp(MAX * 0.84 * spanFactor(0.6) * Math.pow(clamp01(1 - safeErrorRate), 1.2))\);
content = content.replace(/Input: \ngles\, \mirrors\, \esponses\, \ts\\./g, \Input: angles (degrees), mirrors, responses, rts. (radians = angles * Math.PI / 180; load = Math.abs(Math.sin(radians / 2)))\);
content = content.replace(/Th\?i gian ph\?n \?cng s\? d\?ng: \median\(rts\)\\./g, \Th?i gian ph?n ?ng s? d?ng: median(valid_rts) sau khi inspector lo?i b? các m?u < 80ms.\);
content = content.replace(/assertRtBounds.*HARD_MIN_RT_MS.*80ms\)\./g, \ssertCountBounds, (Luu ý: Zod ch? ch?n rác âm/Infinity, còn 80ms du?c inspector dánh soft/hard flag và scorer lo?i b? m?u rác).\);


fs.writeFileSync('docs/feature_games_scoring.txt', content, 'utf8');
