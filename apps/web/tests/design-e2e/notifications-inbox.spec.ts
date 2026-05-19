import { expect, test } from "@playwright/test";

test.describe("notifications inbox", () => {
	test("each notification links to workflow evidence kind:id", async ({ page }) => {
		await page.goto("/notifications-inbox");
		await expect(page.locator("[data-notif-inbox-evidence='n1']")).toHaveText("task:FUL-202");
		await expect(page.locator("[data-notif-inbox-evidence='n3']")).toHaveText("run:r-431");
	});

	test("opening a notification marks it read and surfaces the evidence reference", async ({ page }) => {
		await page.goto("/notifications-inbox");
		await expect(page.locator("[data-notif-inbox-row='n1']")).toHaveAttribute("data-notif-inbox-read", "false");
		await page.locator("[data-notif-inbox-open='n1']").click();
		await expect(page.locator("[data-notif-inbox-row='n1']")).toHaveAttribute("data-notif-inbox-read", "true");
		await expect(page.locator("[data-notif-inbox-opened]")).toContainText("task:FUL-202");
	});
});
