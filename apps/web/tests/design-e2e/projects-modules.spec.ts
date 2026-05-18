import { expect, test } from "../e2e/fixtures";

test.describe("projects modules route interaction coverage", () => {
	test("creates, persists, and deletes modules at desktop width", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("modules-design-desktop", "Modules Design Desktop");
		await page.goto(`/projects/${project.id}/modules`);

		await expect(page.locator("[data-project-modules-header]")).toContainText("Modules");
		await expect(page.locator("[data-empty-modules]")).toContainText("No modules yet.");

		await page.locator("[data-module-primary-action]").click();
		await page.locator("[data-module-name]").fill("Launch readiness");
		await page.locator("[data-module-status]").selectOption("active");
		await page.locator("[data-module-lead]").fill("lead-user-1");
		await page.locator("[data-create-module-submit]").click();

		await expect(page.locator("[data-module-row]").first()).toContainText("Launch readiness");
		await expect(page.locator("[data-module-status-badge]").first()).toContainText("active");
		await expect(page.locator("[data-modules-table]")).toBeVisible();
		await test.info().attach("projects-modules-desktop", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});

		await page.reload();
		await expect(page.locator("[data-module-row]").first()).toContainText("Launch readiness");
		await page.locator("[data-delete-module]").first().click();
		await expect(page.locator("[data-empty-modules]")).toContainText("No modules yet.");
	});

	test("keeps all module controls usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("modules-design-mobile", "Modules Design Mobile");
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${project.id}/modules`);

		await expect(page.locator("[data-module-primary-action]")).toBeVisible();
		await page.locator("[data-module-primary-action]").click();
		await expect(page.locator("[data-module-name]")).toBeFocused();
		await page.locator("[data-module-name]").fill("Mobile module scope");
		await page.locator("[data-module-status]").selectOption("planned");
		await page.locator("[data-module-lead]").fill("mobile-lead");
		await page.locator("[data-create-module-submit]").click();

		await expect(page.locator("[data-modules-mobile-list]")).toBeVisible();
		await expect(page.locator("[data-module-row]").first()).toContainText("Mobile module scope");
		const mobileDelete = page.locator("[data-modules-mobile-list] [data-delete-module]").first();
		await expect(mobileDelete).toBeVisible();
		await test.info().attach("projects-modules-mobile", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});

		const overflow = await page.locator("[data-project-modules-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await mobileDelete.click();
		await expect(page.locator("[data-empty-modules]")).toBeVisible();
	});

	test("falls back to inherited project recovery when project is missing", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id/modules");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});
