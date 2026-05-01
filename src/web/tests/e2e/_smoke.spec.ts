const isPlaywrightCli = process.argv.some((argument) => argument.includes("playwright"));

if (isPlaywrightCli) {
	const { expect, test } = await import("@playwright/test");

	test("home page loads with Fulcrum in title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Fulcrum/i);
	});
}

export {};
