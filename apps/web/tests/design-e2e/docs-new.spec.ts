import { expect, test } from "@playwright/test";

test.describe("docs new route interaction coverage", () => {
	test("renders header, type wizard cards, and form fields", async ({ page }) => {
		await page.goto("/docs/new");

		await expect(page.locator("[data-docs-new-header]")).toContainText("New document");
		await expect(page.locator("[data-back-docs]")).toHaveAttribute("href", "/docs");
		await expect(page.locator("[data-doc-new-wizard]")).toBeVisible();
		await expect(page.locator("[data-doc-type-card]").first()).toBeVisible();
		await expect(page.locator("[data-doc-new-form]")).toBeVisible();
		await expect(page.locator("[data-doc-title]")).toBeVisible();
		await expect(page.locator("[data-doc-kind]")).toBeVisible();
		await expect(page.locator("[data-doc-labels]")).toBeVisible();
		await expect(page.locator("[data-doc-submit]")).toBeVisible();
	});

	test("keeps docs new header and primary controls usable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/docs/new");

		await expect(page.locator("[data-docs-new-header]")).toBeVisible();
		await expect(page.locator("[data-doc-new-wizard]")).toBeVisible();
		await expect(page.locator("[data-doc-title]")).toBeVisible();
		await expect(page.locator("[data-doc-submit]")).toBeVisible();
	});
});
