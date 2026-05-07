import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
}

test.describe("Phase 9.5 critical command palette and settings journeys", () => {
  test("critical journey 09: command palette opens and searches registered routes", async ({ page }) => {
    await expectOkPage(page, "/");
    await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
    await page.locator("[data-command-palette-input]").fill("settings");
    await expect(page.locator("[data-command-palette-item]").first()).toContainText(/Settings|Search Results/);
  });

  test("critical journey 10: settings persistence route renders stable controls", async ({ page }) => {
    await expectOkPage(page, "/settings/inference");
    await expect(page.locator("body")).toContainText(/Settings|Inference|Model|Backend/);
  });
});
