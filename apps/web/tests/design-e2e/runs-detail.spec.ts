import { expect, test } from "@playwright/test";

test.describe("runs detail route interaction coverage", () => {
	test("returns 404 status for missing run", async ({ page }) => {
		const response = await page.goto("/runs/missing-run-id");
		expect(response?.status()).toBe(404);
	});
});
