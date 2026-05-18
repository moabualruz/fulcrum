import { expect, test } from "@playwright/test";

test.describe("runs index route interaction coverage", () => {
	test("shows runs header, dispatch button, and filter chrome at desktop width", async ({ page }) => {
		await page.goto("/runs");

		await expect(page.locator("[data-runs-header]")).toContainText("Agent runs");
		await expect(page.locator("[data-runs-dispatch]")).toBeVisible();
		await expect(page.locator("[data-runs-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-agent-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-status-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-project-filter]")).toBeVisible();
		await expect(page.locator("[data-runs-range-filter]")).toBeVisible();
	});

	test("keeps filter and dispatch controls usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/runs");

		await expect(page.locator("[data-runs-header]")).toBeVisible();
		await expect(page.locator("[data-runs-dispatch]")).toBeVisible();
		await expect(page.locator("[data-runs-filter]")).toBeVisible();

		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
