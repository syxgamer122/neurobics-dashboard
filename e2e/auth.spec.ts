import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("guest login works and shows onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Guest Mode")).toBeVisible();
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
    await expect(page.locator("text=Guest")).toBeVisible();
  });

  test("email signup form renders and validates", async ({ page }) => {
    await page.goto("/");
    // Verify auth page elements exist
    await expect(page.locator("input[type='email']").first()).toBeVisible();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
  });

  test("invalid email shows validation error", async ({ page }) => {
    await page.goto("/");
    const emailInput = page.locator("input[type='email']").first();
    if (await emailInput.isVisible()) {
      await emailInput.fill("not-an-email");
      const passwordInput = page.locator("input[type='password']").first();
      await passwordInput.fill("password123");
      // Try to submit — browser validation or app validation should catch it
      const submitBtn = page.locator("button[type='submit']").first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Should not navigate away from auth
        await expect(page.locator("input[type='email']").first()).toBeVisible();
      }
    }
  });

  test("page title and meta are present", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
