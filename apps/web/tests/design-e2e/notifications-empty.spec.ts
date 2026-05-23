import { expect, test } from "@playwright/test";

test.describe("notifications empty state", () => {
	test("empty state surfaces with explanation and CTA", async ({ page }) => {
		await page.goto("/notifications-empty");
		await expect(page.locator("[data-notif-empty]")).toBeVisible();
		await expect(page.locator("[data-notif-empty]")).toContainText("No notifications");
	});

	test("CTA creates a notification and replaces empty state with a list; clear restores empty state", async ({ page }) => {
		await page.goto("/notifications-empty");
		await page.locator("[data-notif-empty-cta]").click();
		await expect(page.locator("[data-notif-empty]")).toHaveCount(0);
		await expect(page.locator("[data-notif-list-row='n1']")).toBeVisible();
		await page.locator("[data-notif-clear]").click();
		await expect(page.locator("[data-notif-empty]")).toBeVisible();
	});
});
