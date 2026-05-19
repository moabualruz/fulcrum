import { expect, test } from "@playwright/test";

test.describe("mobile observability doctor", () => {
	test("each subsystem renders with a status data attribute and last-check time", async ({ page }) => {
		await page.goto("/mobile-observability");
		await expect(page.locator("[data-mobile-subsystem='database']")).toHaveAttribute("data-mobile-status", "ok");
		await expect(page.locator("[data-mobile-subsystem='queue']")).toHaveAttribute("data-mobile-status", "warn");
		await expect(page.locator("[data-mobile-subsystem='search']")).toHaveAttribute("data-mobile-status", "fail");
		await expect(page.locator("[data-mobile-subsystem='database'] [data-mobile-last-check]")).toContainText("ago");
	});
});
