const isPlaywrightCli = process.argv.some((argument) => argument.includes("playwright"));

if (isPlaywrightCli) {
	const { expect, test } = await import("@playwright/test");

	test("home page loads with Fulcrum in title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Fulcrum/i);
	});

	test("Cmd+K opens command palette, focuses input, and Escape closes it", async ({ page }) => {
		await page.goto("/");
		await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
		await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
		await expect(page.locator("[data-command-palette-input]")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
	});
}

export {};
