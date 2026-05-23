import { expect, test } from "@playwright/test";

test.describe("inbox route interaction coverage", () => {
	test("renders header and tab chrome at desktop width", async ({ page }) => {
		await page.goto("/inbox");

		await expect(page.locator("[data-inbox-header]")).toContainText("Inbox");
		await expect(page.locator("[data-inbox-tabs]")).toBeVisible();
		await expect(page.locator("[data-tab-foryou]")).toBeVisible();
	});

	test("keeps inbox usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/inbox");

		await expect(page.locator("[data-inbox-header]")).toBeVisible();

		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
