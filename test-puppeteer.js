/* eslint-disable */
import puppeteer from "puppeteer";
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on("pageerror", (err) => {
    console.error("PAGE_ERROR:", err.message);
    console.error(err.stack);
  });

  await page.goto("http://localhost:4173/");

  try {
    await page.waitForSelector("button", { timeout: 5000 });

    const tabs = await page.$$("button");
    for (const tab of tabs) {
      const text = await page.evaluate((el) => el.textContent, tab);
      if (text.includes("Arcade")) {
        await tab.click();
        break;
      }
    }

    await page.waitForTimeout(1000);

    const gameCards = await page.$$(".group");
    for (const card of gameCards) {
      const text = await page.evaluate((el) => el.textContent, card);
      if (text.includes("Snake")) {
        console.log("Clicking Snake");
        await card.click();
        await page.waitForTimeout(1000);
      }
    }
    for (const card of gameCards) {
      const text = await page.evaluate((el) => el.textContent, card);
      if (text.includes("Flappy")) {
        console.log("Clicking Flappy");
        await card.click();
        await page.waitForTimeout(1000);
      }
    }
  } catch (e) {
    console.error("Script Error:", e);
  }

  await browser.close();
  process.exit(0);
})();
