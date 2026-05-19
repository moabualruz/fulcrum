import { expect, test } from "@playwright/test";

test.describe("agent window controls", () => {
	test("always-on-top toggle flips its state attribute", async ({ page }) => {
		await page.goto("/agent-window-controls");
		const btn = page.locator("[data-window-toggle-top]");
		await expect(btn).toHaveAttribute("data-window-top-state", "false");
		await btn.click();
		await expect(btn).toHaveAttribute("data-window-top-state", "true");
	});

	test("transparency toggle flips its state attribute", async ({ page }) => {
		await page.goto("/agent-window-controls");
		const btn = page.locator("[data-window-toggle-transparency]");
		await expect(btn).toHaveAttribute("data-window-transparency-state", "false");
		await btn.click();
		await expect(btn).toHaveAttribute("data-window-transparency-state", "true");
	});

	test("minimize to tray reveals tray icon with unread badge; click restores", async ({ page }) => {
		await page.goto("/agent-window-controls");
		await expect(page.locator("[data-window-tray-icon]")).toHaveCount(0);
		await page.locator("[data-window-minimize-tray]").click();
		await expect(page.locator("[data-window-tray-icon]")).toBeVisible();
		await expect(page.locator("[data-window-tray-badge]")).toHaveText("3");
		await page.locator("[data-window-tray-icon]").click();
		await expect(page.locator("[data-window-tray-icon]")).toHaveCount(0);
	});
});
