import { expect, test } from "@playwright/test";

test.describe("run retry policy", () => {
	test("events render with classification and retried state", async ({ page }) => {
		await page.goto("/run-retry-policy");
		await expect(page.locator("[data-retry-event='ev1']")).toHaveAttribute("data-retry-class", "transient");
		await expect(page.locator("[data-retry-event='ev3']")).toHaveAttribute("data-retry-class", "terminal");
		await expect(page.locator("[data-retry-event='ev1']")).toHaveAttribute("data-retry-retried", "true");
		await expect(page.locator("[data-retry-event='ev3']")).toHaveAttribute("data-retry-retried", "false");
	});

	test("budget counters reflect used and remaining", async ({ page }) => {
		await page.goto("/run-retry-policy");
		await expect(page.locator("[data-retry-budget]")).toHaveText("5");
		await expect(page.locator("[data-retry-used]")).toHaveText("2");
		await expect(page.locator("[data-retry-remaining]")).toHaveText("3");
	});

	test("reclassifying a terminal as transient triggers retry within budget", async ({ page }) => {
		await page.goto("/run-retry-policy");
		await page.locator("[data-retry-reclassify='ev3:transient']").click();
		await expect(page.locator("[data-retry-event='ev3']")).toHaveAttribute("data-retry-retried", "true");
	});

	test("increasing the budget grows remaining", async ({ page }) => {
		await page.goto("/run-retry-policy");
		await page.locator("[data-retry-budget-increase]").click();
		await expect(page.locator("[data-retry-budget]")).toHaveText("6");
		await expect(page.locator("[data-retry-remaining]")).toHaveText("4");
	});
});
