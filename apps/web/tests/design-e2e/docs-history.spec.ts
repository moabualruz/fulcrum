import { expect, test } from "@playwright/test";

test.describe("docs history route interaction coverage", () => {
	test("keeps missing document recovery inline on history route", async ({ page }) => {
		const response = await page.goto("/docs/missing-doc-id/history");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-doc-history-error]")).toContainText("Document history could not load");
		await expect(page.locator("[data-doc-history-error]")).toContainText("Recovery:");
		await expect(page.locator("[data-doc-history-error]")).toContainText("docs-history");
		await expect(page.locator("[data-doc-history-error-back]")).toHaveAttribute("href", "/docs");
	});

	test("keeps history recovery readable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/missing-doc-id/history");

		await expect(page.locator("[data-doc-history-error]")).toBeVisible();
		await expect(page.locator("[data-doc-history-error-back]")).toBeVisible();
		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
