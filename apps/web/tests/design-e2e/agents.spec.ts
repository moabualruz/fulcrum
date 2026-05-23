import { expect, test } from "@playwright/test";

test.describe("agents route interaction coverage", () => {
	test("renders header and primary surfaces at desktop width", async ({ page }) => {
		await page.goto("/agents");

		await expect(page.locator("[data-agents-header]")).toContainText("Agents");
		await expect(page.locator("[data-acp-planning-bridge]")).toBeVisible();
	});

	test("keeps the agents view usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/agents");

		await expect(page.locator("[data-agents-header]")).toBeVisible();

		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
