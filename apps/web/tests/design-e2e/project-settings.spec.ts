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

	test("cycle settings form exposes duration, start day, naming pattern, and auto-create", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-cycle-settings]")).toBeVisible();
		await expect(page.locator("[data-cycle-duration]")).toHaveValue("14");
		await expect(page.locator("[data-cycle-start-day]")).toHaveValue("monday");
		await expect(page.locator("[data-cycle-naming-pattern]")).toHaveValue("Sprint {n}");
		await expect(page.locator("[data-cycle-auto-create]")).toBeChecked();
	});

	test("valid cycle save shows confirmation; invalid input shows error", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-cycle-duration]").fill("21");
		await page.locator("[data-cycle-start-day]").selectOption("tuesday");
		await page.locator("[data-cycle-save]").click();
		await expect(page.locator("[data-cycle-saved]")).toContainText("Cycle settings saved");

		await page.locator("[data-cycle-naming-pattern]").fill("Bad pattern");
		await page.locator("[data-cycle-save]").click();
		await expect(page.locator("[data-cycle-error]")).toContainText("placeholder");
	});

	test("workspace settings expose name, slug (locked), timezone, logo, save", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-workspace-general]")).toBeVisible();
		await expect(page.locator("[data-workspace-name]")).toHaveValue("Fulcrum HQ");
		await expect(page.locator("[data-workspace-slug]")).toHaveAttribute("readonly", "");
		await expect(page.locator("[data-workspace-timezone]")).toHaveValue("UTC");

		await page.locator("[data-workspace-timezone]").selectOption("Europe/London");
		await page.locator("[data-workspace-save]").click();
		await expect(page.locator("[data-workspace-saved]")).toContainText("Workspace settings saved");

		await page.locator("[data-workspace-name]").fill("");
		await page.locator("[data-workspace-save]").click();
		await expect(page.locator("[data-workspace-error]")).toContainText("required");
	});
});
