import { expect, test } from "@playwright/test";

test.describe("docs global route interaction coverage", () => {
	test("keeps header, new-doc CTA, and error recovery visible when API unavailable", async ({ page }) => {
		await page.goto("/docs/global");

		await expect(page.locator("[data-global-docs-header]")).toContainText("Global documents");
		await expect(page.locator("[data-back-docs]")).toHaveAttribute("href", "/docs");
		await expect(page.locator("[data-new-doc]")).toHaveAttribute("href", "/docs/new");

		const error = page.locator("[data-global-docs-error]");
		if (await error.isVisible()) {
			await expect(error).toContainText("Global documents could not load");
			await expect(error).toContainText("Recovery:");
			await expect(error).toContainText("docs-global");
			await expect(page.locator("[data-global-docs-error-retry]")).toHaveAttribute("href", "/docs/global");
		} else {
			await expect(
				page
					.locator("[data-empty-global]")
					.or(page.locator("[data-doc-tree]")),
			).toBeVisible();
		}
	});

	test("keeps global docs route usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/global");

		await expect(page.locator("[data-global-docs-header]")).toBeVisible();
		await expect(page.locator("[data-new-doc]")).toBeVisible();
		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
