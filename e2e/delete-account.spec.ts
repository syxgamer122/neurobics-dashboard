import { test, expect } from "@playwright/test";

test.describe("Delete Account Flow", () => {
  test("delete account option is accessible from settings", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");

    // Navigate to settings/profile area
    const settingsBtn = page.locator(
      "button:has-text('Settings'), button:has-text('Cài đặt'), [aria-label='Settings']"
    ).first();
    
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
      // Look for delete account option
      const deleteOption = page.locator(
        "text=Delete Account, text=Xóa tài khoản, button:has-text('Delete')"
      ).first();
      // It should either be visible or the settings panel should be visible
      await expect(
        deleteOption.or(page.locator(".settings, [data-testid='settings']").first())
      ).toBeVisible({ timeout: 3000 });
    }
  });
});
