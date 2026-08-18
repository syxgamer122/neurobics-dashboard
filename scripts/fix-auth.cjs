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

const authPath = 'supabase/functions/server/routes/auth.ts';

// Add a route to finalize the guest upgrade
// Wait, the client will call `/server/upgrade-account` which sends the email/password, and creates the upgrade operation.
// Then the client authenticates with the new account, and then calls `/server/finalize-upgrade`.
const finalizeRoute = `
  // finalize guest upgrade
  app.post("/server/finalize-upgrade", async (c) => {
    try {
      const user = await authenticatedUser(c);
      const { targetEmail } = await c.req.json();
      
      const { error } = await adminClient.rpc("finalize_guest_upgrade_tx", {
        p_user_id: user.id,
        p_target_email: targetEmail
      });
      
      if (error) {
        logServerEvent({
          event: "auth.upgrade.finalize_error",
          level: "error",
          userId: user.id,
          message: error.message
        });
        return c.json({ error: error.message }, 400);
      }
      
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: "Internal server error" }, 500);
    }
  });
`;

let content = fs.readFileSync(authPath, 'utf8');
content = content.replace('export function registerAuthRoutes(app: Hono): void {', 'export function registerAuthRoutes(app: Hono): void {\n' + finalizeRoute);
fs.writeFileSync(authPath, content);
console.log("Added finalize-upgrade");
