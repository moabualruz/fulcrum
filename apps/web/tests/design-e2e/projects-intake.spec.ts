import { expect, test } from "../e2e/fixtures";

test.describe("projects intake route interaction coverage", () => {
	test("creates, persists, and deletes intake requests at desktop width", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("intake-design-desktop", "Intake Design Desktop");
		await page.goto(`/projects/${project.id}/intake`);

		await expect(page.locator("[data-project-intake-header]")).toContainText("Intake");
		await expect(page.locator("[data-empty-intake]")).toContainText("No intake requests yet.");

		await page.locator("[data-intake-primary-action]").click();
		await page.locator("[data-intake-title]").fill("Review imported customer signal");
		await page.locator("[data-intake-source]").fill("support");
		await page.locator("[data-intake-description]").fill("Customer asked for a traceable workflow before this becomes a task.");
		await page.locator("[data-create-intake-submit]").click();

		await expect(page.locator("[data-intake-row]").first()).toContainText("Review imported customer signal");
		await expect(page.locator("[data-intake-status-badge]").first()).toContainText("open");
		await expect(page.locator("[data-intake-table]")).toBeVisible();
		await test.info().attach("projects-intake-desktop", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});

		await page.reload();
		await expect(page.locator("[data-intake-row]").first()).toContainText("Review imported customer signal");
		await page.locator("[data-delete-intake]").first().click();
		await expect(page.locator("[data-empty-intake]")).toContainText("No intake requests yet.");
	});

	test("keeps all intake controls usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("intake-design-mobile", "Intake Design Mobile");
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${project.id}/intake`);

		await expect(page.locator("[data-intake-primary-action]")).toBeVisible();
		await page.locator("[data-intake-primary-action]").click();
		await expect(page.locator("[data-intake-title]")).toBeFocused();
		await page.locator("[data-intake-title]").fill("Mobile captured request");
		await page.locator("[data-intake-source]").fill("field");
		await page.locator("[data-intake-description]").fill("Created from a narrow viewport.");
		await page.locator("[data-create-intake-submit]").click();

		await expect(page.locator("[data-intake-mobile-list]")).toBeVisible();
		await expect(page.locator("[data-intake-row]").first()).toContainText("Mobile captured request");
		const mobileDelete = page.locator("[data-intake-mobile-list] [data-delete-intake]").first();
		await expect(mobileDelete).toBeVisible();
		await test.info().attach("projects-intake-mobile", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});

		const overflow = await page.locator("[data-project-intake-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await mobileDelete.click();
		await expect(page.locator("[data-empty-intake]")).toBeVisible();
	});

	test("falls back to inherited project recovery when project is missing", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id/intake");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});
