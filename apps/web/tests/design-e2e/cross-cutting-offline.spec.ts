import { expect, test } from "@playwright/test";

test.describe("offline reconnect banner", () => {
	test("shows offline banner with last sync timestamp and queued changes", async ({ page }) => {
		await page.goto("/cross-cutting-offline");
		await page.context().setOffline(true);

		await expect(page.locator("[data-offline-page]")).toHaveAttribute("data-hydrated", "true");
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
		await expect(page.locator("[data-offline-banner]")).toHaveAttribute("data-state", "offline");
		await expect(page.locator("[data-offline-banner]")).toContainText("You're offline");
		await expect(page.locator("[data-last-sync-pill]")).toContainText("Last sync");
		await expect(page.locator("[data-last-sync-pill]")).toContainText("UTC");
		await expect(page.locator("[data-sync-now]")).toBeEnabled();
		await expect(page.locator("[data-queued-change]")).toHaveCount(3);
	});

	test("sync now transitions through reconnect and clears the queue", async ({ page }) => {
		await page.goto("/cross-cutting-offline");
		await page.context().setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

		await page.locator("[data-sync-now]").click();
		await expect(page.locator("[data-offline-banner]")).toHaveAttribute("data-state", "syncing");
		await expect(page.locator("[data-sync-now]")).toBeDisabled();
		await expect(page.locator("[data-offline-banner]")).toHaveAttribute("data-state", "online");
		await expect(page.locator("[data-queued-count]")).toContainText("0 pending");
		await expect(page.locator("[data-empty-queue]")).toBeVisible();

		await page.locator("[data-simulate-offline]").click();
		await expect(page.locator("[data-offline-banner]")).toHaveAttribute("data-state", "offline");
		await expect(page.locator("[data-queued-change]")).toHaveCount(3);
	});

	test("stays usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/cross-cutting-offline");

		await expect(page.locator("[data-offline-banner]")).toBeVisible();
		await expect(page.locator("[data-sync-now]")).toBeVisible();

		const overflow = await page.locator("[data-offline-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
