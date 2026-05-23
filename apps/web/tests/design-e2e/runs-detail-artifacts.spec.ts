import { expect, test } from "@playwright/test";

test.describe("runs detail artifacts route interaction coverage", () => {
	test("returns 404 status for missing run", async ({ page }) => {
		const response = await page.goto("/runs/missing-run-id/artifacts");
		expect(response?.status()).toBe(404);
	});
});
