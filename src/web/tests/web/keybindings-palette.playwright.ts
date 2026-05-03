import { expect, test } from "@playwright/test";

test("cmd+k opens command palette under 50ms", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => performance.clearMarks());

	await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");

	await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
	const elapsed = await page.evaluate(() => {
		const mark = performance.getEntriesByName("fulcrum.palette.open").at(-1);
		return mark?.startTime ?? Number.POSITIVE_INFINITY;
	});

	expect(elapsed).toBeLessThan(50);
	await page.keyboard.press("Escape");
	await expect(page.locator("[data-command-palette][data-state='closed']")).toBeVisible();
});
