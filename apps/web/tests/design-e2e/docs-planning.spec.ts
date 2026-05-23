import { expect, test } from "@playwright/test";

test.describe("docs planning route interaction coverage", () => {
	test("keeps missing document recovery inline on planning route", async ({ page }) => {
		const response = await page.goto("/docs/missing-doc-id/planning");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-doc-planning-error]")).toContainText("Document could not load for planning");
		await expect(page.locator("[data-doc-planning-error]")).toContainText("Recovery:");
		await expect(page.locator("[data-doc-planning-error]")).toContainText("docs-planning");
		await expect(page.locator("[data-doc-planning-error-back]")).toHaveAttribute("href", "/docs");
	});

	test("keeps planning recovery readable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/missing-doc-id/planning");

		await expect(page.locator("[data-doc-planning-error]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-error-back]")).toBeVisible();
		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
