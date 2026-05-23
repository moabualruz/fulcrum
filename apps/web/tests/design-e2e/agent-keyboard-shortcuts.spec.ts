import { expect, test } from "@playwright/test";

test.describe("agent keyboard shortcuts", () => {
	test("? opens the cheat sheet and Esc closes it", async ({ page }) => {
		await page.goto("/agent-keyboard-shortcuts");
		await expect(page.locator("[data-shortcuts-cheatsheet]")).toHaveCount(0);
		await page.locator("[data-shortcuts-show]").click();
		await expect(page.locator("[data-shortcuts-cheatsheet]")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator("[data-shortcuts-cheatsheet]")).toHaveCount(0);
	});

	test("Cmd+K triggers palette intent", async ({ page }) => {
		await page.goto("/agent-keyboard-shortcuts");
		await page.keyboard.press("ControlOrMeta+k");
		await expect(page.locator("[data-shortcuts-last]")).toContainText("palette");
	});

	test("cheat sheet enumerates expected shortcut rows", async ({ page }) => {
		await page.goto("/agent-keyboard-shortcuts");
		await page.locator("[data-shortcuts-show]").click();
		await expect(page.locator("[data-shortcut-row='Cmd/Ctrl+K']")).toBeVisible();
		await expect(page.locator("[data-shortcut-row='Cmd/Ctrl+Tab']")).toBeVisible();
		await expect(page.locator("[data-shortcut-row='Shift+Enter']")).toBeVisible();
	});
});
