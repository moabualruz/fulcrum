import { test, expect } from "./fixtures.ts";

test("E-06 command palette journey opens searches and navigates", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
  await page.locator("[data-command-palette-input]").fill("projects");
  await expect(page.locator("[data-command-palette-item]").first()).toContainText(/Projects|Search Results/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects|\/$/);
});
