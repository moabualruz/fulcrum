import { expect, test } from "@playwright/test";

test.describe("projects new route interaction coverage", () => {
	test("renders form chrome with required inputs at desktop width", async ({ page }) => {
		await page.goto("/projects/new");

		await expect(page.locator("[data-projects-new-header]")).toContainText("New project");
		await expect(page.locator("[data-back-projects]")).toHaveAttribute("href", "/projects");
		await expect(page.locator("[data-project-form]")).toBeVisible();
		await expect(page.locator("[data-project-name]")).toBeVisible();
		await expect(page.locator("[data-project-slug]")).toBeVisible();
		await expect(page.locator("[data-project-description]")).toBeVisible();
		await expect(page.locator("[data-project-kind]")).toBeVisible();
	});

	test("keeps form usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/projects/new");

		await expect(page.locator("[data-project-form]")).toBeVisible();
		await expect(page.locator("[data-project-name]")).toBeVisible();

		const overflow = await page
			.locator("main")
			.last()
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
