import { expect, test } from "@playwright/test";

test.describe("projects detail route interaction coverage", () => {
	test("keeps missing project recovery inline on detail route", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toContainText("Project could not load");
		await expect(page.locator("[data-project-detail-error]")).toContainText("Recovery:");
		await expect(page.locator("[data-project-detail-error]")).toContainText("projects-detail");
		await expect(page.locator("[data-project-detail-error-back]")).toHaveAttribute("href", "/projects");
	});

	test("keeps project detail recovery readable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/projects/missing-project-id");

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
		await expect(page.locator("[data-project-detail-error-back]")).toBeVisible();
	});
});
