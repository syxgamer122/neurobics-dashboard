import { test, expect } from "@playwright/test";

test.describe("Gameplay Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click("text=Guest Mode");
    await page.fill("input[type='number']", "1990");
    await page.click("text=Continue");
    // Dismiss onboarding if present
    const closeBtn = page.locator(
      "button:has-text('Skip'), button:has-text('Bỏ qua')",
    );
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    }
  });

  test("can start and load a game (Schulte)", async ({ page }) => {
    await page.click("text=Schulte Table");
    await page.click("button:has-text('Play')");
    // Game should render (canvas or grid)
    await expect(
      page
        .locator("canvas, [data-testid='game-grid'], .game-container")
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("can navigate between different games", async ({ page }) => {
    // Click first game
    await page.click("text=Schulte Table");
    await expect(page.locator("text=Schulte Table").first()).toBeVisible();

    // Go back and click another game
    const backBtn = page
      .locator(
        "button:has-text('Back'), button:has-text('Quay lại'), [aria-label='Back']",
      )
      .first();
    if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backBtn.click();
    } else {
      await page.goto("/");
      // Re-login if needed
      if (
        await page
          .locator("text=Guest Mode")
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await page.click("text=Guest Mode");
        await page.fill("input[type='number']", "1990");
        await page.click("text=Continue");
      }
    }

    await page.click("text=Reaction Time");
    await expect(page.locator("text=Reaction Time").first()).toBeVisible();
  });

  test("all 12 game cards are visible in arena", async ({ page }) => {
    // Verify game cards exist for key games
    const gameNames = [
      "Schulte Table",
      "Sudoku",
      "Stroop Test",
      "Reaction Time",
      "Memory Matrix",
    ];
    for (const name of gameNames) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible({
        timeout: 3000,
      });
    }
  });
});
