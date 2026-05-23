import { expect, test } from "@playwright/test";

test.describe("notifications settings", () => {
	test("toggling a matrix cell flips its checked state", async ({ page }) => {
		await page.goto("/notifications-settings");
		const toggle = page.locator("[data-notif-toggle='comments.email']");
		await expect(toggle).not.toBeChecked();
		await toggle.check();
		await expect(toggle).toBeChecked();
	});

	test("quiet hours start equal to end surfaces error and blocks save", async ({ page }) => {
		await page.goto("/notifications-settings");
		await page.locator("[data-quiet-start]").fill("09:00");
		await page.locator("[data-quiet-end]").fill("09:00");
		await page.locator("[data-notif-settings-save]").click();
		await expect(page.locator("[data-notif-settings-error]")).toContainText("must differ");
	});

	test("disabling quiet hours saves without time-range validation", async ({ page }) => {
		await page.goto("/notifications-settings");
		await page.locator("[data-quiet-enabled]").uncheck();
		await page.locator("[data-notif-settings-save]").click();
		await expect(page.locator("[data-notif-settings-saved]")).toContainText("no quiet hours");
	});
});
