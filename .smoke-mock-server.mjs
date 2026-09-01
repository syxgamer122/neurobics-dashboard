// Mock Supabase backend cho runtime smoke test local (khong phai production code).
// Chay: node .smoke-mock-server.mjs  -> http://localhost:5198
import http from "node:http";
import { randomUUID } from "node:crypto";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const nowIso = () => new Date().toISOString();

const PROFILE = {
  id: USER_ID,
  username: "guest_smoke",
  avatar_url: null,
  role: "player",
  birth_year: 1990,
  algebraic_logic_score: null,
  memory_score: null,
  speed_score: null,
  focus_score: null,
  cfop_spatial_record: null,
  total_xp: 0,
  last_active_date: null,
  schulte_sessions: 0,
  sudoku_sessions: 0,
  stroop_sessions: 0,
  reaction_sessions: 0,
  memory_sessions: 0,
  nback_sessions: 0,
  math_sessions: 0,
  gonogo_sessions: 0,
  mental_sessions: 0,
  corsi_sessions: 0,
  trail_sessions: 0,
  search_sessions: 0,
  created_at: nowIso(),
};

const SESSION = {
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    btoa(
      JSON.stringify({
        sub: USER_ID,
        role: "authenticated",
        exp: Date.now() / 1000 + 3600,
      }),
    ) +
    ".smoke",
  refresh_token: "smoke-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: USER_ID,
    email: "guest_smoke@mindgem.local",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: nowIso(),
  },
};

function ticket(game) {
  const now = Date.now();
  return {
    roundId: randomUUID(),
    game,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    challengeSeed: randomUUID(),
    challengeConfig: {},
  };
}

function submitted() {
  return {
    profile: { ...PROFILE, total_xp: 15, schulte_sessions: 1 },
    axes: { speed: 61.5, focus: 58.2, spatial: null, logic: null, memory: 55 },
    headline: 42,
    label: "good",
    timeMs: 61234,
    xpAwarded: 15,
    totalXp: 15,
    level: 1,
    leveledUp: false,
  };
}

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const path = (req.url || "").split("?")[0];
  const send = (code, body) => {
    res.writeHead(code, cors);
    res.end(JSON.stringify(body));
  };

  console.log(`${req.method} ${path}`);

  if (path === "/functions/v1/server/signup" && req.method === "POST")
    return send(200, {
      profile: PROFILE,
      _guestName: "guest_smoke",
      _guestPw: "SmokeTest123!",
    });
  if (path === "/functions/v1/server/flags") return send(200, { flags: {} });
  if (path === "/functions/v1/server/activate-round")
    return send(200, ticket("schulte"));
  if (path === "/functions/v1/server/submit-round")
    return send(200, submitted());
  if (path === "/functions/v1/server/telemetry") return send(202, {});
  if (path === "/functions/v1/server/sync-offline-rounds")
    return send(200, { results: [] });

  if (path === "/auth/v1/token") return send(200, SESSION);
  if (path === "/auth/v1/user" || path === "/auth/v1/logout")
    return send(200, path.endsWith("user") ? { ...SESSION.user } : {});

  if (
    path === "/rest/v1/rpc/get_my_profile" ||
    path === "/rest/v1/rpc/ensure_my_profile"
  )
    return send(200, PROFILE);
  if (path === "/rest/v1/rpc/get_leaderboard") return send(200, [PROFILE]);
  if (path === "/rest/v1/rpc/get_population_stats")
    return send(200, { total_players: 1, active_players: 1 });
  if (path === "/rest/v1/rpc/get_activity_stats") return send(200, {});

  if (path.startsWith("/rest/v1/")) return send(200, []);
  return send(200, {});
});

server.listen(5198, () => console.log("smoke mock supabase on :5198"));
