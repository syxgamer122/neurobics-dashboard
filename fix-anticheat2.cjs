const fs = require('fs');
let content = fs.readFileSync('docs/feature_anticheat_observability.txt', 'utf8');

content = content.replace(/Quy trình x? lý t?i Route \/server\/submit-round:[\s\S]*?p_details\)\./, 
\Quy trình x? lý t?i Route /server/submit-round:
1. Ki?m tra kích thu?c body (tru?c khi parse JSON).
2. Parse JSON.
3. Claim ticket nguyên t?: UPDATE round_tickets SET state = 'processing', processing_token = gen_random_uuid() WHERE id = p_round_id AND state = 'issued' RETURNING *.
4. T?i challenge_config t? ticket, gán dè vào telemetry d? tránh vi?c client t? s?a d? khó.
5. Parse Zod Schema theo game.
6. G?i inspectRound(gameId, telemetry, serverElapsedMs).
7. Finalize nguyên t? (d?a vào processing_token): 
   - N?u pass: state = 'accepted', g?i submit_round_transaction.
   - N?u Hard Flag: state = 'rejected', g?i reject_round_ticket kèm cheat flag trong cùng 1 transaction.\);

content = content.replace(/2\. Middleware nh?n request[\s\S]*?Luu chi ti?t c? Hard vào DB/g, 
\2. Middleware nh?n request -> C?p x-request-id
3. Router claim ticket thành 'processing' nguyên t?
4. T?i config t? ticket d? tính di?m
5. Ch?y hàm ki?m tra inspectRound
6. N?u dính Hard Flag: G?i reject_round_ticket d? burn ticket và ghi cheat flag\);

content = content.replace(/1\. Ng\?i ch\?i hoAn thAnh vA\?n -> Client g\?i.*?fingerprint }\}\./g, '1. Ngu?i choi hoàn thành ván -> Client g?i POST /server/submit-round ch?a roundId, game, telemetry, fingerprint.');

fs.writeFileSync('docs/feature_anticheat_observability.txt', content, 'utf8');
