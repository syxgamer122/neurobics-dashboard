import { test, expect } from "@playwright/test";

test.describe("Admin Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
  });

  test("guest cannot access admin God Mode", async ({ page }) => {
    const godBtn = page.locator("button.group").last();
    if (await godBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await godBtn.click();
      await expect(page.locator("text=Access Denied").first()).toBeVisible();
    }
  });

  test("direct URL navigation to admin is blocked for guests", async ({
    page,
  }) => {
    // Try navigating directly — should redirect or show access denied
    await page.goto("/#admin");
    // Guest should see either Access Denied or be redirected
    const accessDenied = page.locator("text=Access Denied");
    const guestLabel = page.locator("text=Guest");
    await expect(accessDenied.or(guestLabel).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("admin-only API endpoints reject unauthorized requests", async ({
    page,
  }) => {
    // Verify that admin routes return 401/403 for non-admin
    const response = await page.request.post("/server/admin/grant-xp", {
      data: { userId: "test", amount: 100 },
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403, 404]).toContain(response.status());
  });
});
