import { expect, test } from "@playwright/test";

test.describe("agent notifications", () => {
	test("permission prompt grants and surfaces a notification row", async ({ page }) => {
		await page.goto("/agent-notifications");
		await page.locator("[data-notif-permission]").click();
		await expect(page.locator("[data-notif-permission]")).toBeDisabled();
		await expect(page.locator("[data-notif-row]").first()).toBeVisible();
	});

	test("input-needed and error notifications identify session and kind", async ({ page }) => {
		await page.goto("/agent-notifications");
		await page.locator("[data-notif-simulate-input]").click();
		await expect(page.locator("[data-notif-kind='input-needed']")).toHaveAttribute("data-notif-session", "session-2");
		await page.locator("[data-notif-simulate-error]").click();
		await expect(page.locator("[data-notif-kind='error']")).toHaveAttribute("data-notif-session", "session-3");
	});

	test("clicking a notification focuses the session and dismisses non-persistent rows", async ({ page }) => {
		await page.goto("/agent-notifications");
		await page.locator("[data-notif-simulate-input]").click();
		const row = page.locator("[data-notif-kind='input-needed']");
		await expect(row).toHaveAttribute("data-notif-persistent", "false");
		await row.locator("[data-notif-click]").click();
		await expect(page.locator("[data-notif-focused]")).toContainText("session-2");
		await expect(page.locator("[data-notif-kind='input-needed']")).toHaveCount(0);
	});

	test("away mode marks new notifications as persistent", async ({ page }) => {
		await page.goto("/agent-notifications");
		await page.locator("[data-notif-away]").check();
		await page.locator("[data-notif-simulate-error]").click();
		await expect(page.locator("[data-notif-kind='error']")).toHaveAttribute("data-notif-persistent", "true");
	});
});
