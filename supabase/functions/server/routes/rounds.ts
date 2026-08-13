import type { Hono } from "npm:hono@4.12.27";
import {
  hasHardFlag,
  inspectRound,
  softFlags,
} from "../../_shared/anticheat.ts";
import { isGame, scoreAndValidate } from "../../_shared/round-scoring.ts";
import { logServerEvent, requestIdFor } from "../../_shared/observability.ts";
import { adminClient, MAX_TICKET_STARTS_PER_MINUTE } from "../config.ts";
import { authenticatedUser } from "../security.ts";

export function registerRoundRoutes(app: Hono): void {
  // ─── Secure round lifecycle ──────────────────────────────────────────────────
  // Creates a one-time ticket. The browser cannot write round_tickets directly.
  app.post("/server/start-round", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { game } = await c.req.json();
      const gameId = String(game);
      if (!isGame(gameId)) return c.json({ error: "Invalid game" }, 400);

      // Mot user chi co the choi mot van tai mot thoi diem. Dong ticket cu truoc
      // khi mint ticket moi, tranh ticket warm/refresh bi tich trong 3 gio roi
      // khoa nham nguoi choi bang 429.
      const { error: closeError } = await adminClient
        .from("round_tickets")
        .update({ submitted_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("submitted_at", null);
      if (closeError) throw closeError;

      // Van chan spam DB that su, nhung dem toc do tao trong 1 phut thay vi dem
      // ticket bo do trong 3 gio. Nguoi choi binh thuong khong the cham 20 lan/phut.
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count, error: countError } = await adminClient
        .from("round_tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gt("created_at", oneMinuteAgo);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_TICKET_STARTS_PER_MINUTE) {
        return c.json(
          { error: "Too many round starts. Wait one minute and try again." },
          429,
        );
      }

      const { data, error } = await adminClient
        .from("round_tickets")
        .insert({ user_id: user.id, game: gameId })
        .select("id, game, started_at, expires_at")
        .single();
      if (error) throw error;
      return c.json({
        roundId: data.id,
        game: data.game,
        startedAt: data.started_at,
        expiresAt: data.expires_at,
      });
    } catch (err) {
      console.log(`Start round error: ${err}`);
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        401,
      );
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

      const { data: ticket, error: ticketError } = await adminClient
        .from("round_tickets")
        .select("id, user_id, game, started_at, expires_at, submitted_at")
        .eq("id", String(roundId))
        .eq("user_id", user.id)
        .single();
      if (ticketError || !ticket)
        return c.json({ error: "Round ticket not found" }, 404);
      if (ticket.game !== gameId)
        return c.json({ error: "Round game mismatch" }, 400);
      if (ticket.submitted_at)
        return c.json({ error: "Round already submitted" }, 409);
      if (Date.parse(ticket.expires_at) < Date.now())
        return c.json({ error: "Round ticket expired" }, 410);

      const serverElapsedMs = Date.now() - Date.parse(ticket.started_at);

      // Lớp chống gian lận: hard flag từ chối ván, soft flag vẫn chấm nhưng ghi log.
      const cheat = inspectRound(gameId, telemetry, serverElapsedMs);
      if (hasHardFlag(cheat)) {
        // Dot ticket TRUOC khi tra 422 de khong bien anti-cheat thanh oracle thu lai.
        const { error: burnError } = await adminClient
          .from("round_tickets")
          .update({ submitted_at: new Date().toISOString() })
          .eq("id", ticket.id)
          .is("submitted_at", null);
        if (burnError) {
          console.log(`Hard-rejected ticket burn failed: ${burnError.message}`);
          return c.json({ error: "Round could not be finalized." }, 503);
        }

        const hard = cheat.flags.filter((f) => f.severity === "hard");
        for (const f of hard) {
          const { error: hardErr } = await adminClient.rpc(
            "record_cheat_flag",
            {
              p_user_id: user.id,
              p_game: gameId,
              p_reason: f.msg,
              p_severity: "hard",
              p_details: f.detail ?? {},
            },
          );
          if (hardErr)
            console.log(`Hard cheat flag failed: ${hardErr.message}`);
        }
        logServerEvent({
          event: "anticheat.hard_reject",
          level: "warn",
          game: gameId,
          userId: user.id,
          requestId: requestIdFor(c.req.raw),
          message: hard.map((f) => f.msg).join("; "),
          statusCode: 422,
        });

        return c.json(
          {
            error: "Round rejected: suspicious timing patterns.",
            code: "anticheat_hard",
            flags: hard.map((f) => f.msg),
          },
          422,
        );
      }
      for (const f of softFlags(cheat)) {
        const { error: softErr } = await adminClient.rpc("record_cheat_flag", {
          p_user_id: user.id,
          p_game: gameId,
          p_reason: f.msg,
          p_severity: "soft",
          p_details: f.detail ?? {},
        });
        if (softErr) console.log(`Soft cheat flag failed: ${softErr.message}`);
      }

      // Ghi dấu vân thiết bị (không chặn ván nếu RPC lỗi).
      if (typeof fingerprint === "string" && fingerprint.length >= 8) {
        const { error: fpErr } = await adminClient.rpc("link_device", {
          p_user_id: user.id,
          p_fingerprint: fingerprint.slice(0, 200),
        });
        if (fpErr) console.log(`link_device failed: ${fpErr.message}`);
      }

      const scored = scoreAndValidate(gameId, telemetry, serverElapsedMs);
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
          severity: f.severity,
        })),
      });
    } catch (err) {
      console.log(`Submit round error: ${err}`);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      const lower = message.toLowerCase();
      // Hono chi nhan ContentfulStatusCode, khong nhan number chung chung.
      let status: 400 | 401 | 409 = 400;
      if (
        lower.includes("authorization") ||
        lower.includes("session") ||
        lower.includes("expired") ||
        lower.includes("invalid or expired") ||
        lower.includes("missing authorization")
      )
        status = 401;
      else if (lower.includes("already submitted")) status = 409;
      return c.json({ error: message }, status);
    }
  });

  // Gửi một mảng các ván chơi khi kết nối mạng được khôi phục.
  app.post("/server/sync-offline-rounds", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { rounds } = await c.req.json();
      if (!Array.isArray(rounds))
        return c.json({ error: "rounds must be an array" }, 400);

      const results = [];
      for (const round of rounds) {
        const { game, telemetry, fingerprint, startedAt, clientElapsedMs, clientRoundId } = round;
        const gameId = String(game);
        if (!isGame(gameId) || !clientRoundId) {
          results.push({ clientRoundId: clientRoundId || "unknown", status: "error", error: "Invalid payload" });
          continue;
        }

        const fallbackStartedAt = startedAt || new Date().toISOString();

        // 1. Check for existing ticket with same game + user + started_at to avoid duplicates
        const { data: existing } = await adminClient
          .from("round_tickets")
          .select("id, submitted_at")
          .eq("user_id", user.id)
          .eq("game", gameId)
          .eq("started_at", fallbackStartedAt)
          .single();

        if (existing?.submitted_at) {
          results.push({ clientRoundId, status: "duplicate" });
          continue;
        }

        let ticket = existing;

        if (!ticket) {
          // Tao 1 ticket thuc su tren DB de pass duoc submit_round_transaction
          const { data: newTicket, error: insertErr } = await adminClient
            .from("round_tickets")
            .insert({
              user_id: user.id,
              game: gameId,
              started_at: fallbackStartedAt,
            })
            .select("id")
            .single();

          if (insertErr || !newTicket) {
            results.push({ clientRoundId, status: "error", error: "Failed to create offline ticket" });
            continue;
          }
          ticket = newTicket;
        }

        const cheat = inspectRound(gameId, telemetry, clientElapsedMs || 0);
        // Them soft flag canh bao offline
        cheat.flags.push({
          severity: "soft",
          msg: "Offline sync: timing verification bypassed",
        });

        if (hasHardFlag(cheat)) {
          await adminClient
            .from("round_tickets")
            .update({ submitted_at: new Date().toISOString() })
            .eq("id", ticket.id);
          results.push({
            clientRoundId,
            status: "rejected",
            error: "Round rejected: suspicious timing patterns.",
            code: "anticheat_hard",
          });
          continue;
        }

        for (const f of softFlags(cheat)) {
          await adminClient.rpc("record_cheat_flag", {
            p_user_id: user.id,
            p_game: gameId,
            p_reason: f.msg,
            p_severity: "soft",
            p_details: f.detail ?? {},
          });
        }

        const scored = scoreAndValidate(
          gameId,
          telemetry,
          clientElapsedMs || 0,
        );
        const axisPayload = Object.fromEntries(
          Object.entries(scored.axes).filter(([, value]) => value !== null),
        );

        const { data, error } = await adminClient.rpc(
          "submit_round_transaction",
          {
            p_user_id: user.id,
            p_ticket_id: String(ticket.id),
            p_game: gameId,
            p_axes: axisPayload,
            p_round_score: scored.headline,
            p_label: scored.label,
            p_time_ms: Math.round(scored.timeMs),
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

        results.push({ clientRoundId, status: "ok" });
      }

      return c.json({ results });
    } catch (err) {
      console.log(`Sync rounds error: ${err}`);
      return c.json({ error: String(err) }, 500);
    }
  });

  // Legacy endpoint deliberately disabled: accepting roundScore directly from the
  // browser would bypass server-side telemetry scoring.
  app.post("/server/award-xp", (c) =>
    c.json({ error: "Deprecated: use start-round + submit-round" }, 410),
  );
}
