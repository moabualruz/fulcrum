import { expect, test } from "@playwright/test";

test.describe("projects e2e runner route interaction coverage", () => {
	test("renders e2e runner form and history for a project id", async ({ page }) => {
		await page.goto("/projects/00000000-0000-0000-0000-000000000000/e2e");

		await expect(page.getByTestId("e2e-runner-page")).toBeVisible();
		await expect(page.locator("[data-e2e-run-form]")).toBeVisible();
		await expect(page.locator("[data-e2e-history]")).toBeVisible();
	});
});
