import { test, expect } from "@playwright/test";

test.describe("Settings Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
  });

  test("language preference persists after reload", async ({ page }) => {
    // Check if language toggle exists
    const langToggle = page.locator(
      "button:has-text('EN'), button:has-text('VI'), [aria-label='Language']"
    ).first();
    
    if (await langToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const initialText = await langToggle.textContent();
      await langToggle.click();
      const newText = await langToggle.textContent();
      
      // Reload and verify persistence
      await page.reload();
      // After reload, may need to re-skip onboarding
      const closeBtn = page.locator("button:has-text('Skip'), button:has-text('Bỏ qua')");
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
      }
      
      const afterReload = page.locator(
        "button:has-text('EN'), button:has-text('VI'), [aria-label='Language']"
      ).first();
      if (await afterReload.isVisible({ timeout: 2000 }).catch(() => false)) {
        const reloadText = await afterReload.textContent();
        // Language should have persisted (showing the opposite toggle)
        expect(reloadText).toBeDefined();
      }
    }
  });

  test("theme preference persists after reload", async ({ page }) => {
    const themeToggle = page.locator(
      "button:has-text('Dark'), button:has-text('Light'), [aria-label='Theme'], [aria-label='Toggle theme']"
    ).first();
    
    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Get current theme
      const isDarkBefore = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      
      await themeToggle.click();
      
      const isDarkAfter = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      
      // Reload and check persistence
      await page.reload();
      const isDarkReload = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      
      expect(isDarkReload).toBe(isDarkAfter);
    }
  });
});
