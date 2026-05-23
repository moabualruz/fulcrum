import { test, expect } from "./fixtures.ts";

test("E-06 command palette journey opens searches and navigates", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await expect(page.locator("[data-command-palette]")).toHaveAttribute("data-state", "open");
  await expect(page.locator("[data-command-palette-input]")).toBeVisible();
  await page.locator("[data-command-palette-input]").fill("projects");
  await expect(page.locator("[data-command-palette-item]").first()).toContainText(/Projects|Search Results/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects|\/$/);
});

test("ScopeBar palette button opens the global command palette", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");

  await page.locator("[data-scope-system-icon='command-palette']").click();

  await expect(page.locator("[data-command-palette]")).toHaveAttribute("data-state", "open");
  await expect(page.locator("[data-command-palette-input]")).toBeVisible();
  await expect(page.locator("[data-scope-system-panel='command-palette']")).toHaveCount(0);
});

test("StatusFooter palette button opens the global command palette", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");

  await page.locator("[data-trace-footer-palette]").click();

  await expect(page.locator("[data-command-palette]")).toHaveAttribute("data-state", "open");
  await expect(page.locator("[data-command-palette-input]")).toBeVisible();
});
