const fs = require('fs');
let code = fs.readFileSync('supabase/functions/server/routes/rounds.ts', 'utf8');

// The file might be slightly messy from my last two replace calls. Let's fix it safely.
// Wait, I will just rewrite the `if (shouldReject(cheat))` block and `softFlags(cheat)` block.
code = code.replace(/if \(shouldReject\(cheat\)\) \{[\s\S]*?422,\n\s+\);\n\s+\}/g, `if (shouldReject(cheat)) {
        const { error: burnError } = await adminClient.rpc(
          "reject_round_ticket",
          {
            p_round_id: ticket.id,
            p_user_id: user.id,
          },
        );
        if (burnError) {
          logServerEvent({
            event: "server.log",
            level: "error",
            userId: user.id,
            message: \`reject_round_ticket failed: \${burnError.message}\`,
          });
          return c.json({ error: "Round could not be finalized." }, 503);
        }

        // Instead of hard, we iterate all cheat flags if we decided to reject
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
              message: \`Hard cheat flag failed: \${hardErr.message}\`,
            });
        }

        logServerEvent({
          event: "anticheat.hard_reject",
          level: "warn",
          userId: user.id,
          message: \`Rejected \${gameId} round (\${ticket.id})\`,
        });

        return c.json(
          {
            error: "Round rejected: suspicious timing patterns.",
            code: "anticheat_hard",
            flags: cheat.flags.map((f) => f.msg),
          },
          422,
        );
      }`);

// Fix soft flags block
code = code.replace(/for \(const f of softFlags\(cheat\)\) \{[\s\S]*?\}\n\s+\}/g, `for (const f of softFlags(cheat)) {
        const { error: softErr } = await adminClient.rpc("record_cheat_flag", {
          p_user_id: user.id,
          p_game: gameId,
          p_reason: f.msg,
          p_signal_class: f.signal_class,
          p_details: f.detail ?? {},
          p_round_id: ticket.id,
        });
        if (softErr) {
          logServerEvent({
            event: "server.log",
            level: "error",
            message: \`Soft cheat flag failed: \${softErr.message}\`,
          });
        }
      }`);

// Offline round cheat recording
code = code.replace(/p_severity: f\.severity,/g, 'p_signal_class: f.signal_class,');
code = code.replace(/p_severity: "hard",/g, 'p_signal_class: f.signal_class,');

fs.writeFileSync('supabase/functions/server/routes/rounds.ts', code);
console.log('Fixed rounds.ts');
