import { expect, test } from "@playwright/test";

test.describe("run cost tracking", () => {
	test("totals reflect aggregated turn input output and cost", async ({ page }) => {
		await page.goto("/run-cost-tracking");
		await expect(page.locator("[data-cost-total-input]")).toHaveText("860");
		await expect(page.locator("[data-cost-total-output]")).toHaveText("1560");
		await expect(page.locator("[data-cost-total-amount]")).toContainText("$0.0081");
	});

	test("rate-limit events list with backoff times", async ({ page }) => {
		await page.goto("/run-cost-tracking");
		await expect(page.locator("[data-rate-event='0'] [data-rate-event-backoff]")).toHaveText("3s");
		await expect(page.locator("[data-rate-event='1'] [data-rate-event-backoff]")).toHaveText("7s");
	});

	test("trend chart renders a bar per turn", async ({ page }) => {
		await page.goto("/run-cost-tracking");
		await expect(page.locator("[data-cost-trend-bar]")).toHaveCount(4);
		await expect(page.locator("[data-cost-trend-bar='0']")).toHaveAttribute("data-cost-trend-ts", "10:00");
	});

	test("budget remaining reflects total minus consumed", async ({ page }) => {
		await page.goto("/run-cost-tracking");
		await expect(page.locator("[data-cost-budget-remaining]")).toContainText("$0.9919");
	});
});
