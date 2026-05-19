import { expect, test } from "@playwright/test";

test.describe("sessions empty state", () => {
	test("empty state shows icon, title, explanation, and Start a Run CTA linking to tasks", async ({ page }) => {
		await page.goto("/sessions-empty");
		await expect(page.locator("[data-sessions-empty]")).toBeVisible();
		await expect(page.locator("[data-sessions-empty-icon]")).toBeVisible();
		await expect(page.locator("[data-sessions-empty]")).toContainText("No sessions");
		await expect(page.locator("[data-sessions-empty-cta]")).toHaveAttribute("href", "/tasks");
	});

	test("starting a sample session replaces empty state with list and clear restores", async ({ page }) => {
		await page.goto("/sessions-empty");
		await page.locator("[data-sessions-empty-add]").click();
		await expect(page.locator("[data-sessions-empty]")).toHaveCount(0);
		await expect(page.locator("[data-sessions-row='s1']")).toBeVisible();
		await page.locator("[data-sessions-clear]").click();
		await expect(page.locator("[data-sessions-empty]")).toBeVisible();
	});
});
