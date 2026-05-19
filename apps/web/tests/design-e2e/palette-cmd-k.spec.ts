import { expect, test } from "@playwright/test";

test.describe("workspace cmd-k palette", () => {
	test("Cmd+K opens modal, Esc closes", async ({ page }) => {
		await page.goto("/palette-cmd-k");
		await expect(page.locator("[data-palette-modal]")).toHaveCount(0);
		await page.keyboard.press("ControlOrMeta+k");
		await expect(page.locator("[data-palette-modal]")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator("[data-palette-modal]")).toHaveCount(0);
	});

	test("Empty query shows recent items above non-recent", async ({ page }) => {
		await page.goto("/palette-cmd-k");
		await page.locator("[data-palette-trigger]").click();
		await expect(page.locator("[data-palette-recent-marker]")).toHaveText("Recent");
		await expect(page.locator("[data-palette-row='t-1']")).toBeVisible();
	});

	test("Fuzzy match filters and ranks results", async ({ page }) => {
		await page.goto("/palette-cmd-k");
		await page.locator("[data-palette-trigger]").click();
		await page.locator("[data-palette-input]").fill("fuzy");
		await expect(page.locator("[data-palette-row='t-2']")).toBeVisible();
	});

	test("Arrow keys move selection; Enter opens", async ({ page }) => {
		await page.goto("/palette-cmd-k");
		await page.locator("[data-palette-trigger]").click();
		await expect(page.locator("[data-palette-list] li").first()).toHaveAttribute("data-palette-selected", "true");
		await page.keyboard.press("ArrowDown");
		await expect(page.locator("[data-palette-list] li").nth(1)).toHaveAttribute("data-palette-selected", "true");
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-palette-opened]")).toBeVisible();
		await expect(page.locator("[data-palette-modal]")).toHaveCount(0);
	});
});
