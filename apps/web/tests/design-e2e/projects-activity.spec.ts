import { expect, test } from "@playwright/test";

test.describe("projects activity route interaction coverage", () => {
	test("renders header and filter controls for any project id", async ({ page }) => {
		await page.goto("/projects/00000000-0000-0000-0000-000000000000/activity");

		await expect(page.locator("[data-activity-header]")).toBeVisible();
		await expect(page.locator("[data-activity-filter]")).toBeVisible();
		await expect(page.locator("[data-activity-kind-filter]")).toBeVisible();
		await expect(page.locator("[data-activity-verb-filter]")).toBeVisible();
		await expect(page.locator("[data-activity-actor-filter]")).toBeVisible();
	});

	test("keeps activity filter controls reachable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/projects/00000000-0000-0000-0000-000000000000/activity");

		await expect(page.locator("[data-activity-header]")).toBeVisible();
		await expect(page.locator("[data-activity-filter]")).toBeVisible();
	});
});
