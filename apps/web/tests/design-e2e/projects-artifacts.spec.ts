import { expect, test } from "@playwright/test";

test.describe("projects artifacts route interaction coverage", () => {
	test("renders artifacts header for a project id", async ({ page }) => {
		await page.goto("/projects/00000000-0000-0000-0000-000000000000/artifacts");

		await expect(page.locator("[data-project-artifacts-header]")).toBeVisible();
	});

	test("keeps artifacts summary reachable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/projects/00000000-0000-0000-0000-000000000000/artifacts");

		await expect(page.locator("[data-project-artifacts-header]")).toBeVisible();
	});
});
