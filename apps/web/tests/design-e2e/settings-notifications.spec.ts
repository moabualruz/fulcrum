import { expect, test } from "@playwright/test";

test.describe("settings notifications", () => {
	test("renders delivery, categories, per-page rules, and digest sections", async ({ page }) => {
		await page.goto("/settings/notifications");

		await expect(page.locator("[data-settings-notifications-header]")).toContainText("Notification settings");
		await expect(page.locator("[data-notification-delivery]")).toBeVisible();
		await expect(page.locator("[data-delivery-email-toggle]")).toBeChecked();
		await expect(page.locator("[data-delivery-inapp-toggle]")).toBeChecked();
		await expect(page.locator("[data-quiet-hours-start]")).toBeVisible();
		await expect(page.locator("[data-quiet-hours-end]")).toBeVisible();

		await expect(page.locator("[data-notification-categories]")).toBeVisible();
		for (const category of ["mentions", "comments", "page_updates", "subscriptions"]) {
			await expect(page.locator(`[data-notification-category='${category}']`)).toBeChecked();
		}

		await expect(page.locator("[data-notification-per-page]")).toBeVisible();
		await expect(page.locator("[data-notification-digest]")).toBeVisible();
		await expect(page.locator("[data-digest-select]")).toHaveValue("daily");
	});

	test("muting a page lists it and unmute removes the chip", async ({ page }) => {
		await page.goto("/settings/notifications");

		await page.locator("[data-mute-page-input]").fill("Roadmap Q3");
		await page.locator("[data-mute-page]").click();
		await expect(page.locator("[data-muted-page='Roadmap Q3']")).toBeVisible();
		await page.locator("[data-unmute-page='Roadmap Q3']").click();
		await expect(page.locator("[data-muted-page='Roadmap Q3']")).toHaveCount(0);
	});

	test("save action persists preferences when input is valid", async ({ page }) => {
		await page.goto("/settings/notifications");

		await page.locator("[data-quiet-hours-start]").fill("22:00");
		await page.locator("[data-quiet-hours-end]").fill("08:00");
		await page.locator("[data-digest-select]").selectOption("weekly");
		await page.locator("[data-save-preferences]").click();
		await expect(page.locator("[data-preferences-saved]")).toContainText("Preferences saved");
		await expect(page.locator("[data-preferences-error]")).toHaveCount(0);
	});
});
