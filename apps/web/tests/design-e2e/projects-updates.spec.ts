import { expect, test } from "@playwright/test";

test.describe("projects updates route interaction coverage", () => {
	test("falls back to inherited project recovery when project is missing", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id/updates");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});
