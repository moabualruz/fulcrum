import { expect, test } from "@playwright/test";

test.describe("planning route interaction coverage", () => {
	test("renders main planning page with primary forms", async ({ page }) => {
		await page.goto("/planning");

		await expect(page.locator("[data-planning-page]")).toBeVisible();
		await expect(page.locator("h1").filter({ hasText: "Planning" })).toBeVisible();
		await expect(page.locator("[data-planning-form]")).toBeVisible();
		await expect(page.locator("[data-freeform-start-form]")).toBeVisible();
		await expect(page.locator("[data-freeform-planning-form]")).toBeVisible();
		await expect(page.locator("[data-guided-acp-form]")).toBeVisible();
		await expect(page.locator("[data-continuous-update-form]")).toBeVisible();
		await expect(page.locator("[data-technical-planning-form]")).toBeVisible();
		await expect(page.locator("[data-workflow-cycle-form]")).toBeVisible();
	});

	test("preview button stays reachable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/planning");

		await expect(page.locator("[data-planning-page]")).toBeVisible();
		await expect(page.locator("[data-planning-form] button[formaction='?/preview']")).toBeVisible();
		await expect(page.locator("[data-planning-form] button[formaction='?/materialize']")).toBeVisible();
	});
});
