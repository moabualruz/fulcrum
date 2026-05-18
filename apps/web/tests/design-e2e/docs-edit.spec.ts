import { expect, test } from "@playwright/test";

test.describe("docs edit route interaction coverage", () => {
	test("keeps missing document recovery inline on edit route", async ({ page }) => {
		const response = await page.goto("/docs/missing-doc-id/edit");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-doc-edit-error]")).toContainText("Document could not load for editing");
		await expect(page.locator("[data-doc-edit-error]")).toContainText("Recovery:");
		await expect(page.locator("[data-doc-edit-error]")).toContainText("docs-edit");
		await expect(page.locator("[data-doc-edit-error-back]")).toHaveAttribute("href", "/docs");
	});

	test("keeps edit recovery readable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/missing-doc-id/edit");

		await expect(page.locator("[data-doc-edit-error]")).toBeVisible();
		await expect(page.locator("[data-doc-edit-error-back]")).toBeVisible();
		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
