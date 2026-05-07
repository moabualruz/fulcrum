const isPlaywrightCli = process.argv.some((argument) => argument.includes("playwright"));

if (isPlaywrightCli) {
	const { expect, test } = await import("./fixtures.ts");
	const { NAV_ITEMS } = await import("../../src/lib/components/app/nav-data.ts");

	test("home page loads with Fulcrum in title", async ({ page, fulcrumHome: _fulcrumHome }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Fulcrum/i);
	});

	test("every primary nav route SSRs without an error page", async ({ page, fulcrumHome: _fulcrumHome }) => {
		for (const item of NAV_ITEMS) {
			const response = await page.goto(item.href);
			expect(response?.ok(), `${item.href} returned ${response?.status() ?? "no response"}`).toBe(true);
			await expect(page.locator("body")).not.toContainText("Internal Error");
			await expect(page.locator("body")).not.toContainText("Not found");
			await expect(page.locator("body")).not.toContainText("This page could not be found");
		}
	});

	test("Cmd+K opens command palette, focuses input, and Escape closes it", async ({
		page,
		fulcrumHome: _fulcrumHome,
	}) => {
		await page.goto("/");
		await page.waitForFunction(() => document.body.dataset.fulcrumHydrated === "true");
		await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
		await expect(page.locator("[data-command-palette][data-state='open']")).toBeVisible();
		await expect(page.locator("[data-command-palette-input]")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.locator("[data-command-palette][data-state='open']")).toHaveCount(0);
	});
}

export {};
