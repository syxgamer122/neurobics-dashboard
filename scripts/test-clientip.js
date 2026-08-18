const { clientIp } = require('./supabase/functions/server/security.ts');
console.log(clientIp({ req: { headers: { get: () => '203.0.113.1, 198.51.100.1' } } }));
