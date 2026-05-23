import { expect, test } from "@playwright/test";

test.describe("projects index", () => {
	test("shows dense project rows with filters, activity, and primary actions", async ({ page }) => {
		await page.goto("/projects");

		await expect(page.locator("[data-projects-header]")).toContainText("Projects");
		await expect(page.locator("[data-new-project]")).toBeVisible();
		await expect(page.locator("[data-import-projects]")).toBeVisible();
		await expect(page.locator("[data-projects-filter]")).toBeVisible();
		await expect(page.locator("[data-status-filter]")).toBeVisible();

		const rows = page.locator("[data-project-row]");
		if (await rows.first().isVisible()) {
			await expect(rows.first().locator("[data-project-status-badge]")).toBeVisible();
			await expect(rows.first().locator("[data-project-counts]")).toContainText(/open|task|doc/);
			await expect(rows.first().locator("[data-project-primary-action]")).toBeVisible();
		} else {
			await expect(page.locator("[data-empty-projects]")).toBeVisible();
			await expect(page.locator("[data-empty-create-project]")).toBeVisible();
			await expect(page.locator("[data-empty-import-projects]")).toBeVisible();
			await expect(page.locator("[data-empty-open-existing]")).toBeVisible();
		}

		await page.locator("[data-projects-filter]").fill("definitely-no-project");
		await expect(page.locator("[data-projects-filter]")).toHaveValue("definitely-no-project");
		if (await page.locator("[data-empty-filter]").isVisible()) {
			await expect(page.locator("[data-applied-filters]")).toContainText("Search:");
			await page.locator("[data-empty-filter-reset]").click();
			await expect(page.locator("[data-projects-filter]")).toHaveValue("");
		}
	});

	test("keeps project actions reachable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/projects");

		await expect(page.locator("[data-new-project]")).toBeVisible();
		if (await page.locator("[data-project-row]").first().isVisible()) {
			await expect(page.locator("[data-project-primary-action]").first()).toBeVisible();
			await expect(page.locator("[data-set-active-project]").first()).toBeVisible();
		} else {
			await expect(page.locator("[data-empty-create-project]")).toBeVisible();
			await expect(page.locator("[data-empty-import-projects]")).toBeVisible();
		}

		const overflow = await page
			.locator("[data-projects-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
