import { expect, test } from "@playwright/test";

test.describe("project settings labels", () => {
	test("lists labels with hierarchy and renders an Archived bucket", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-project-settings-header]")).toContainText("Labels");
		await expect(page.locator("[data-label-row='lbl_bug']")).toBeVisible();
		await expect(page.locator("[data-label-children='lbl_bug'] [data-label-child='lbl_bug_p1']")).toBeVisible();
		await expect(page.locator("[data-label-archived-row='lbl_legacy']")).toBeVisible();
	});

	test("add label appends a new active row", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-name-input]").fill("research");
		await page.locator("[data-add-label]").click();
		await expect(page.locator("[data-label-name]:has-text('research')")).toBeVisible();
	});

	test("add label with duplicate name surfaces an error", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-name-input]").fill("bug");
		await page.locator("[data-add-label]").click();
		await expect(page.locator("[data-label-create-error]")).toContainText("already exists");
	});

	test("rename action commits and updates the displayed name", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-rename='lbl_design']").click();
		await page.locator("[data-rename-input='lbl_design']").fill("ux");
		await page.locator("[data-rename-commit='lbl_design']").click();
		await expect(page.locator("[data-label-name='lbl_design']")).toHaveText("ux");
	});

	test("archive moves a label out of Active and restore brings it back", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-archive='lbl_design']").click();
		await expect(page.locator("[data-label-row='lbl_design']")).toHaveCount(0);
		await expect(page.locator("[data-label-archived-row='lbl_design']")).toBeVisible();
		await page.locator("[data-label-restore='lbl_design']").click();
		await expect(page.locator("[data-label-row='lbl_design']")).toBeVisible();
	});

	test("delete is gated to archived labels", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-delete='lbl_legacy']").click();
		await expect(page.locator("[data-label-archived-row='lbl_legacy']")).toHaveCount(0);
	});
});
