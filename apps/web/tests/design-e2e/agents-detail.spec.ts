import { expect, test } from "@playwright/test";

test.describe("agents detail route interaction coverage", () => {
	test("returns 404 status for missing agent profile", async ({ page }) => {
		const response = await page.goto("/agents/missing-agent-name");
		expect(response?.status()).toBe(404);
	});
});
