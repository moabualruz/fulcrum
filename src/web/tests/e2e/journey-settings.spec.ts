import { test, expect } from "./fixtures.ts";

test("E-07 settings journey uses single settings entry and reaches inference settings", async ({ page }) => {
  const response = await page.goto("/settings/inference");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Inference|Settings/);

  await page.goto("/");
  const settingsLinks = page.locator("a[href='/settings/inference']");
  await expect(settingsLinks.first()).toBeVisible();
  await expect(settingsLinks).toHaveCount(1);
});
