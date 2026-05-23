import { expect, test } from "@playwright/test";

test.describe("docs detail route interaction coverage", () => {
	test("keeps missing document recovery inline", async ({ page }) => {
		await page.goto("/docs/missing-doc-id");

		await expect(page.locator("[data-doc-detail-error]")).toContainText("Document could not load");
		await expect(page.locator("[data-doc-detail-error]")).toContainText("Recovery:");
		await expect(page.locator("[data-doc-detail-error]")).toContainText("docs-detail");
		await expect(page.locator("[data-doc-detail-error-back]")).toHaveAttribute("href", "/docs");
	});

	test("keeps doc detail recovery readable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/missing-doc-id");

		await expect(page.locator("[data-doc-detail-error]")).toBeVisible();
		await expect(page.locator("[data-doc-detail-error-back]")).toBeVisible();
		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
