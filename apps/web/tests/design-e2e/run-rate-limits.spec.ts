import { expect, test } from "@playwright/test";

test.describe("rate-limit handling", () => {
	test("events expose status retry-after and backoff", async ({ page }) => {
		await page.goto("/run-rate-limits");
		await expect(page.locator("[data-rate-row='rl1'] [data-rate-status-code]")).toHaveText("429");
		await expect(page.locator("[data-rate-row='rl2'] [data-rate-retry-after]")).toHaveText("4s");
		await expect(page.locator("[data-rate-row='rl3'] [data-rate-backoff]")).toHaveText("8s");
	});

	test("auto-retry audit entry exists per event and force-retry adds another", async ({ page }) => {
		await page.goto("/run-rate-limits");
		await expect(page.locator("[data-rate-audit]")).toContainText("auto-retry:rl1");
		await page.locator("[data-rate-force='rl2']").click();
		await expect(page.locator("[data-rate-audit]")).toContainText("force-retry:rl2");
	});
});
