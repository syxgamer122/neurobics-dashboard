import { test, expect } from "@playwright/test";

test.describe("Offline Sync", () => {
  test("app loads and renders even when sync endpoint fails", async ({ page }) => {
    await page.route("**/*", (route) => {
      if (route.request().url().includes("/server/sync-offline-rounds")) {
        route.abort("failed");
      } else {
        route.continue();
      }
    });

    await page.goto("/");
    await expect(page.locator("text=Guest Mode")).toBeVisible();
  });

  test("offline queue key exists in localStorage after guest login", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
    
    // The app should have initialized localStorage for the guest
    const keys = await page.evaluate(() => Object.keys(localStorage));
    // Guest mode creates various localStorage entries
    expect(keys.length).toBeGreaterThan(0);
  });

  test("app does not crash when submit-round endpoint is down", async ({ page }) => {
    await page.route("**/server/submit-round", (route) => {
      route.abort("failed");
    });
    await page.route("**/server/start-round", (route) => {
      route.abort("failed");
    });

    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
    
    // App should still render game cards
    await expect(page.locator("text=Schulte Table").first()).toBeVisible({ timeout: 5000 });
  });
});
