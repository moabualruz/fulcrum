import { test, expect } from "./fixtures.ts";

test("E-06 command palette journey opens searches and navigates", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
  await page.locator("[data-command-palette-input]").fill("projects");
  await expect(page.locator("[data-command-palette-item]").first()).toContainText(/Projects|Search Results/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects|\/$/);
});
