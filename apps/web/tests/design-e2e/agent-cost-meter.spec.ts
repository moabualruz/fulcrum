import { expect, test } from "@playwright/test";

test.describe("agent cost meter", () => {
	test("token and tool counters increment as activity arrives", async ({ page }) => {
		await page.goto("/agent-cost-meter");

		await expect(page.locator("[data-cost-tokens]")).toHaveText("0 tokens");
		await expect(page.locator("[data-cost-calls]")).toHaveText("0 calls");

		await page.locator("[data-cost-add-message]").click();
		await expect(page.locator("[data-cost-tokens]")).toHaveText("850 tokens");

		await page.locator("[data-cost-add-tool]").click();
		await expect(page.locator("[data-cost-tokens]")).toHaveText("1.1k tokens");
		await expect(page.locator("[data-cost-calls]")).toHaveText("1 calls");
	});

	test("tier escalates from low to medium to high as tokens accumulate", async ({ page }) => {
		await page.goto("/agent-cost-meter");
		await expect(page.locator("[data-cost-meter]")).toHaveAttribute("data-cost-tier", "low");

		for (let i = 0; i < 8; i++) await page.locator("[data-cost-add-message]").click();
		await expect(page.locator("[data-cost-meter]")).toHaveAttribute("data-cost-tier", "medium");

		for (let i = 0; i < 30; i++) await page.locator("[data-cost-add-message]").click();
		await expect(page.locator("[data-cost-meter]")).toHaveAttribute("data-cost-tier", "high");
	});

	test("cost estimate hidden when price availability is toggled off", async ({ page }) => {
		await page.goto("/agent-cost-meter");
		await page.locator("[data-cost-add-message]").click();
		await expect(page.locator("[data-cost-estimate]")).toBeVisible();

		await page.locator("[data-cost-toggle-price]").click();
		await expect(page.locator("[data-cost-estimate-missing]")).toBeVisible();
		await expect(page.locator("[data-cost-estimate]")).toHaveCount(0);
	});
});
