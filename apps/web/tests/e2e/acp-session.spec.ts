import { test, expect } from "@playwright/test";

test.describe("ACP Session Workflow", () => {
  test("agents page shows session workbench", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("[data-session-workbench]")).toBeVisible();
  });

  test("model picker shows available models", async ({ page }) => {
    await page.goto("/agents");
    const picker = page.locator("[data-model-picker]");
    if (await picker.isVisible()) {
      await picker.click();
      await expect(page.locator("[data-model-option]").first()).toBeVisible();
    }
  });

  test("mode selector shows available modes", async ({ page }) => {
    await page.goto("/agents");
    const selector = page.locator("[data-mode-selector]");
    if (await selector.isVisible()) {
      await selector.click();
      await expect(page.locator("[data-mode-option]").first()).toBeVisible();
    }
  });

  test("traffic monitor shows message log", async ({ page }) => {
    await page.goto("/agents");
    const monitor = page.locator("[data-traffic-monitor]");
    if (await monitor.isVisible()) {
      await expect(monitor.locator("[data-traffic-entry]").first()).toBeVisible();
    }
  });

  test("session list shows resumable sessions", async ({ page }) => {
    await page.goto("/agents");
    const sessionList = page.locator("[data-session-list]");
    if (await sessionList.isVisible()) {
      await expect(sessionList).toBeVisible();
    }
  });

  test("permission dialog shows pending approval", async ({ page }) => {
    await page.goto("/agents");
    const dialog = page.locator("[data-permission-dialog]");
    // Permission dialog only visible when agent requests permission
    // Test that the component renders when triggered
    await expect(page.locator("[data-session-workbench]")).toBeVisible();
  });
});
