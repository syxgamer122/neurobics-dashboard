import type { Hono } from "npm:hono@4.12.27";
import {
  shouldReject,
  inspectRound,
  softFlags,
  INSPECTOR_VERSIONS,
} from "../../_shared/anticheat.ts";
import { AppError } from "../../_shared/errors.ts";
import {
  isGame,
  scoreAndValidate,
  SCORER_VERSIONS,
  TELEMETRY_SCHEMA_VERSION,
} from "../../_shared/round-scoring.ts";
import { parseTelemetry } from "../../_shared/scoring/schema.ts";
import {
  beginRequest,
  logServerEvent,
  requestIdFor,
} from "../../_shared/observability.ts";
import { adminClient, MAX_TICKET_STARTS_PER_MINUTE } from "../config.ts";
import { authenticatedUser, consumeRateLimit } from "../security.ts";

export function registerRoundRoutes(app: Hono): void {
  // ─── Secure round lifecycle ──────────────────────────────────────────────────
  // Creates a one-time ticket. The browser cannot write round_tickets directly.
  app.post("/server/activate-round", async (c) => {
    try {
      const user = await authenticatedUser(c);

      // Chong spam mint ticket: moi user chi duoc bat dau toi da 20 van/phut.
      const startAllowed = await consumeRateLimit(
        `ticket_starts:${user.id}`,
        MAX_TICKET_STARTS_PER_MINUTE,
        60,
      );
      if (!startAllowed) {
        return c.json(
          { error: "Too many round starts. Please wait a moment." },
          429,
        );
      }

      const { game, config, clientBuildId, clientConfigHash } =
        await c.req.json();
      const gameId = String(game);
      if (!isGame(gameId)) return c.json({ error: "Invalid game" }, 400);

      const challengeSeed = crypto.randomUUID();
      const challengeConfig =
        typeof config === "object" && config !== null ? config : {};

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
        p_client_config_hash: clientConfigHash || "unknown",
      });

      if (error) throw error;
      return c.json({
        roundId: data.id,
        game: data.game,
        startedAt: data.started_at,
        expiresAt: data.expires_at,
        challengeSeed: data.challenge_seed,
        challengeConfig: data.challenge_config,
      });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Start round error: ${err}`,
      });
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status);
      }
      logServerEvent({
        event: "start_round.unhandled",
        level: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: requestIdFor(c.req.raw),
      });
      return c.json({ error: "Could not start round" }, 500);
    }
  });

  // One finish request: validate telemetry, score on server, atomically save axes,
  // session, and XP, then return the fresh profile for immediate rendering.
  app.post("/server/submit-round", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const body = await c.req.json();
      const { roundId, game, telemetry, fingerprint } = body ?? {};
      const gameId = String(game);
      if (!roundId || !isGame(gameId))
        return c.json({ error: "roundId and valid game are required" }, 400);

      // Claim ticket atomically
      const processingToken = crypto.randomUUID();
      const { data: ticket, error: ticketError } = await adminClient
        .from("round_tickets")
        .update({
          state: "processing",
          processing_token: processingToken,
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", String(roundId))
        .eq("user_id", user.id)
        .eq("state", "issued")
        .select(
          "id, user_id, game, started_at, expires_at, state, telemetry_version, scorer_version, inspector_version, challenge_config",
        )
        .single();

      if (ticketError || !ticket) {
        // If not found, check if it exists but is not 'issued'
        const { data: existing } = await adminClient
          .from("round_tickets")
          .select("state, expires_at")
          .eq("id", String(roundId))
          .single();
        if (!existing)
          return c.json(
            { error: "Round ticket not found", code: "ticket_not_found" },
            404,
          );
        if (existing.state === "accepted" || existing.state === "rejected")
          return c.json(
            { error: "Round already submitted", code: "already_submitted" },
            409,
          );
        if (Date.parse(existing.expires_at) < Date.now())
          return c.json(
            { error: "Round ticket expired", code: "ticket_expired" },
            410,
          );
        return c.json({ error: "Round ticket unavailable" }, 409);
      }

      if (ticket.game !== gameId)
        return c.json({ error: "Round game mismatch" }, 400);

      const serverElapsedMs = Date.now() - Date.parse(ticket.started_at);

      // Validate schema and inject challenge config from server
      const parsedTelemetry = parseTelemetry(gameId, telemetry);
      if (
        ticket.challenge_config &&
        typeof ticket.challenge_config === "object"
      ) {
        Object.assign(parsedTelemetry, ticket.challenge_config);
      }

      // Lớp chống gian lận: reject nếu có physical flag hoặc >=2 statistical flags.
      const cheat = inspectRound(gameId, parsedTelemetry, serverElapsedMs);
      if (shouldReject(cheat)) {
        const { error: burnError } = await adminClient.rpc(
          "reject_round_ticket",
          {
            p_user_id: user.id,
            p_ticket_id: ticket.id,
            p_processing_token: processingToken,
            p_reason: "hard_cheat_detected",
          },
        );

        if (burnError) {
          logServerEvent({
            event: "server.log",
            level: "error",
            message: `Hard-rejected ticket burn failed: ${burnError.message}`,
          });
          return c.json({ error: "Round could not be finalized." }, 503);
        }

        // Record all cheat flags that triggered rejection
        for (const f of cheat.flags) {
          const { error: hardErr } = await adminClient.rpc(
            "record_cheat_flag",
            {
              p_user_id: user.id,
              p_game: gameId,
              p_reason: f.msg,
              p_signal_class: f.signal_class,
              p_details: f.detail ?? {},
              p_round_id: ticket.id,
            },
          );
          if (hardErr)
            logServerEvent({
              event: "server.log",
              level: "error",
              message: `Hard cheat flag failed: ${hardErr.message}`,
            });
        }
        logServerEvent({
          event: "anticheat.hard_reject",
          level: "warn",
          game: gameId,
          userId: user.id,
          requestId: requestIdFor(c.req.raw),
          message: cheat.flags.map((f) => f.msg).join("; "),
          statusCode: 422,
        });

        return c.json(
          {
            error: "Round rejected: suspicious timing patterns.",
            code: "anticheat_hard",
            flags: ["timing_patterns_rejected"],
          },
          422,
        );
      }

      // Record soft (statistical) flags — round is NOT rejected
      for (const f of softFlags(cheat)) {
        const { error: softErr } = await adminClient.rpc("record_cheat_flag", {
          p_user_id: user.id,
          p_game: gameId,
          p_reason: f.msg,
          p_signal_class: f.signal_class,
          p_details: f.detail ?? {},
          p_round_id: ticket.id,
        });
        if (softErr)
          logServerEvent({
            event: "server.log",
            level: "error",
            message: `Soft cheat flag failed: ${softErr.message}`,
          });
      }

      // Ghi dấu vân thiết bị (không chặn ván nếu RPC lỗi).
      if (typeof fingerprint === "string" && fingerprint.length >= 8) {
        const { error: fpErr } = await adminClient.rpc("link_device", {
          p_user_id: user.id,
          p_fingerprint: fingerprint.slice(0, 200),
        });
        if (fpErr)
          logServerEvent({
            event: "server.log",
            level: "error",
            message: `link_device failed: ${fpErr.message}`,
          });
      }

      const scored = scoreAndValidate(gameId, parsedTelemetry, serverElapsedMs);
      const axisPayload = Object.fromEntries(
        Object.entries(scored.axes).filter(([, value]) => value !== null),
      );

      const { data, error } = await adminClient.rpc(
        "submit_round_transaction",
        {
          p_user_id: user.id,
          p_ticket_id: String(roundId),
          p_game: gameId,
          p_axes: axisPayload,
          p_round_score: scored.headline,
          p_label: scored.label,
          p_time_ms: Math.round(scored.timeMs),
          p_telemetry_version:
            ticket.telemetry_version ?? TELEMETRY_SCHEMA_VERSION,
          p_scorer_version: ticket.scorer_version ?? SCORER_VERSIONS[gameId],
          p_inspector_version:
            ticket.inspector_version ?? INSPECTOR_VERSIONS[gameId],
        },
      );
      if (error) {
        throw new Error(error.message);
      }

      return c.json({
        ...data,
        axes: scored.axes,
        headline: scored.headline,
        label: scored.label,
        timeMs: scored.timeMs,
        cheatFlags: cheat.flags.map((f) => ({
          msg: f.msg,
          signal_class: f.signal_class,
        })),
      });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Submit round error: ${err}`,
      });
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status);
      }

      // Hono chi nhan ContentfulStatusCode, khong nhan number chung chung.
      // Mac dinh 500: loi khong nhan dien thuoc ve server, khong phai loi client.
      let status: 401 | 409 | 500 = 500;
      let code: string | undefined;
      let clientMessage = "Round could not be saved.";
      // Chi nhan dien chinh xac 2 message ma authenticatedUser() throw
      // (security.ts) — match free-text nhu "includes('session')" se bat nham
      // ca loi Postgres chua tu khoa do roi tra 401 sai.
      if (
        message === "Missing authorization" ||
        message === "Invalid or expired session"
      ) {
        status = 401;
        code = "unauthenticated";
        clientMessage = "Session expired. Please sign in again.";
      } else if (message.toLowerCase().includes("already submitted")) {
        // submit_round_transaction raise 'Round already submitted' khi nap lai
        // ticket da chap nhan — phai kem code de client xoa ticket chet thay vi
        // retry vo han voi cung mot ticket.
        status = 409;
        code = "already_submitted";
        clientMessage = "Round already submitted";
      }

      logServerEvent({
        event: "submit_round.unhandled",
        level: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: requestIdFor(c.req.raw),
      });
      return c.json(
        code ? { error: clientMessage, code } : { error: clientMessage },
        status,
      );
    }
  });

  // Gửi một mảng các ván chơi khi kết nối mạng được khôi phục.
  app.post("/server/sync-offline-rounds", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { rounds } = await c.req.json();
      if (!Array.isArray(rounds))
        return c.json({ error: "rounds must be an array" }, 400);

      const MAX_SYNC_BATCH = 25;
      const MAX_OFFLINE_AGE_MS = 7 * 24 * 3600_000;

      if (rounds.length > MAX_SYNC_BATCH) {
        return c.json({ error: "Too many rounds in one batch" }, 413);
      }

      const results = [];
      for (const round of rounds) {
        const {
          game,
          telemetry,
          fingerprint,
          startedAt,
          clientElapsedMs,
          clientRoundId,
        } = round;
        const gameId = String(game);
        if (!isGame(gameId) || !clientRoundId) {
          results.push({
            clientRoundId: clientRoundId || "unknown",
            status: "error",
            error: "Invalid payload",
          });
          continue;
        }

        try {
          const startedMs = Date.parse(startedAt ?? "");
          if (
            !Number.isFinite(startedMs) ||
            startedMs > Date.now() + 60_000 ||
            Date.now() - startedMs > MAX_OFFLINE_AGE_MS
          ) {
            results.push({
              clientRoundId,
              status: "rejected",
              error: "Stale or invalid startedAt",
            });
            continue;
          }

          const elapsed = Math.min(
            Math.max(Number(clientElapsedMs) || 0, 500),
            2 * 3600_000,
          );

          const cheat = inspectRound(gameId, telemetry, elapsed, true);
          const isHardCheat = shouldReject(cheat);

          let cheatReasons = null;
          if (cheat.flags.length > 0) {
            cheatReasons = isHardCheat
              ? cheat.flags.filter((f) => f.signal_class === "physical")
              : softFlags(cheat);
          }

          const scored = scoreAndValidate(gameId, telemetry, elapsed);
          const axisPayload = Object.fromEntries(
            Object.entries(scored.axes).filter(([, value]) => value !== null),
          );

          const { data: rpcData, error } = await adminClient.rpc(
            "submit_offline_round_tx",
            {
              p_user_id: user.id,
              p_client_round_id: clientRoundId,
              p_game: gameId,
              p_started_at: new Date(startedMs).toISOString(),
              p_axes: axisPayload,
              p_round_score: scored.headline,
              p_label: scored.label,
              p_time_ms: Math.round(scored.timeMs),
              p_scorer_version: SCORER_VERSIONS[gameId],
              p_is_hard_cheat: isHardCheat,
              p_cheat_reasons: cheatReasons,
            },
          );

          if (error) {
            results.push({
              clientRoundId,
              status: "error",
              error: error.message,
            });
            continue;
          }

          if (rpcData?.status === "duplicate") {
            results.push({ clientRoundId, status: "duplicate" });
            continue;
          }

          logServerEvent({
            event: "offline_sync.ok",
            level: "info",
            game: gameId,
            userId: user.id,
            requestId: requestIdFor(c.req.raw),
            message: `Synced offline round ${clientRoundId}`,
            persist: true,
          });

          results.push({ clientRoundId, status: "ok" });
        } catch (err) {
          logServerEvent({
            event: "offline_sync.round_failed",
            level: "warn",
            game: gameId,
            userId: user.id,
            requestId: requestIdFor(c.req.raw),
            message: err instanceof Error ? err.message : String(err),
          });
          results.push({
            clientRoundId,
            status: "rejected",
            error: "Round could not be validated",
          });
        }
      }

      return c.json({ results });
    } catch (err) {
      logServerEvent({
        event: "server.log",
        level: "error",
        message: `Sync rounds error: ${err}`,
      });
      return c.json({ error: String(err) }, 500);
    }
  });

  // Legacy endpoint deliberately disabled: accepting roundScore directly from the
  // browser would bypass server-side telemetry scoring.
  app.post("/server/award-xp", (c) =>
    c.json({ error: "Deprecated: use activate-round + submit-round" }, 410),
  );
}
