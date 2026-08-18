const fs = require('fs');

function replaceRegex(filepath, targetRegex, replacement) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (content.match(targetRegex)) {
        content = content.replace(targetRegex, replacement);
        fs.writeFileSync(filepath, content);
        console.log('Success ' + filepath);
    } else {
        console.log('Not found in ' + filepath);
    }
}

// 1. In rounds.ts, replace start-round with activate-round and use RPC
const roundsPath = 'supabase/functions/server/routes/rounds.ts';
const activateRoundTarget = /app\.post\("\/server\/start-round", async \(c\) => \{[\s\S]*?\.insert\(\{[\s\S]*?challenge_config: challengeConfig,\n\s*\}\)[\s\S]*?\.single\(\);/;

const activateRoundReplacement = `app.post("/server/activate-round", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { game, config, clientBuildId, clientConfigHash } = await c.req.json();
      const gameId = String(game);
      if (!isGame(gameId)) return c.json({ error: "Invalid game" }, 400);

      const challengeSeed = crypto.randomUUID();
      const challengeConfig = typeof config === 'object' && config !== null ? config : {};

      // Activate ticket atomically
      const { data, error } = await adminClient.rpc("activate_round_ticket", {
        p_user_id: user.id,
        p_game: gameId,
        p_telemetry_version: TELEMETRY_SCHEMA_VERSION,
        p_scorer_version: SCORER_VERSIONS[gameId] ?? 1,
        p_inspector_version: INSPECTOR_VERSIONS[gameId] ?? 1,
        p_rating_model_version: 1, // HARDCODED for now
        p_inspector_rule_set_hash: "sha256:TODO", // We will fix this in anticheat
        p_challenge_seed: challengeSeed,
        p_challenge_config: challengeConfig,
        p_client_build_id: clientBuildId || "unknown",
        p_client_config_hash: clientConfigHash || "unknown"
      });
`;
replaceRegex(roundsPath, activateRoundTarget, activateRoundReplacement);


// 2. We need to fix the guest upgrade route in auth.ts (or account.ts).
const authPath = 'supabase/functions/server/routes/auth.ts';
// Actually, let's search where upgrade is first.
