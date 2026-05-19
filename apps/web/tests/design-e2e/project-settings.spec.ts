import { expect, test } from "@playwright/test";

test.describe("project settings labels", () => {
	test("lists labels with hierarchy and renders an Archived bucket", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-project-settings-header]")).toContainText("Labels");
		await expect(page.locator("[data-label-row='lbl_bug']")).toBeVisible();
		await expect(page.locator("[data-label-children='lbl_bug'] [data-label-child='lbl_bug_p1']")).toBeVisible();
		await expect(page.locator("[data-label-usage='lbl_bug']")).toContainText("18 uses");
		await expect(page.locator("[data-label-color='lbl_bug']")).toHaveCSS("background-color", "oklch(0.68 0.18 30)");
		await expect(page.locator("[data-label-archived-row='lbl_legacy']")).toBeVisible();
	});

	test("add label appends a child row with selected color", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-name-input]").fill("research");
		await page.locator("[data-label-parent-select]").selectOption("lbl_design");
		await page.locator("[data-color-swatch='oklch(0.72 0.16 145)']").click();
		await page.locator("[data-add-label]").click();
		const research = page.locator("[data-label-children='lbl_design'] [data-label-name]:has-text('research')");
		await expect(research).toBeVisible();
		await expect(page.locator("[data-label-children='lbl_design'] li:has-text('research') [data-label-color]")).toHaveCSS("background-color", "oklch(0.72 0.16 145)");
		await expect(page.locator("[data-color-contrast-status='oklch(0.72 0.16 145)']")).toHaveAttribute("title", "AA ready");
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
		await expect(page.locator("[data-label-usage='lbl_design']")).toContainText("11 uses");
		await page.locator("[data-label-restore='lbl_design']").click();
		await expect(page.locator("[data-label-row='lbl_design']")).toBeVisible();
	});

	test("archiving a parent moves children to root instead of deleting them", async ({ page }) => {
		await page.goto("/project-settings");

		await page.locator("[data-label-archive='lbl_bug']").click();
		await expect(page.locator("[data-label-archive-notice]")).toContainText("1 child label moved to root");
		await expect(page.locator("[data-label-row='lbl_bug']")).toHaveCount(0);
		await expect(page.locator("[data-label-row='lbl_bug_p1']")).toBeVisible();
		await expect(page.locator("[data-label-name='lbl_bug_p1']")).toHaveText("p1");
	});

	test("reorder persists active label order", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-label-list] [data-label-row]").first()).toHaveAttribute("data-label-row", "lbl_bug");
		await page.locator("[data-label-move-up='lbl_design']").click();
		await expect(page.locator("[data-label-list] [data-label-row]").first()).toHaveAttribute("data-label-row", "lbl_design");
		await expect(page.locator("[data-label-order-saved]")).toContainText("Order saved");
	});

	test("bulk delete removes selected archived labels only", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-label-delete='lbl_legacy']")).toHaveCount(0);
		await page.locator("[data-label-archived-select='lbl_legacy']").check();
		await page.locator("[data-label-bulk-delete-archived]").click();
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

	test("estimate scale preview reflects selection and rejects empty custom values", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-estimate-preview]")).toContainText("1, 2, 3, 5, 8, 13, 21");
		await page.locator("[data-estimate-scale]").selectOption("xs-xl");
		await expect(page.locator("[data-estimate-preview]")).toContainText("1, 2, 3, 5, 8");
		await page.locator("[data-estimate-scale]").selectOption("custom");
		await page.locator("[data-estimate-custom]").fill("abc");
		await page.locator("[data-estimate-save]").click();
		await expect(page.locator("[data-estimate-error]")).toContainText("at least one estimate");
		await page.locator("[data-estimate-custom]").fill("1, 3, 7");
		await page.locator("[data-estimate-save]").click();
		await expect(page.locator("[data-estimate-saved]")).toContainText("Estimate scale saved");
	});

	test("bulk estimate applies the chosen value to selected tasks and totals update", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-estimate-total]")).toContainText("Total points: 8");
		await page.locator("[data-plan-task-select='FUL-202']").check();
		await page.locator("[data-bulk-estimate]").selectOption("5");
		await page.locator("[data-bulk-apply]").click();
		await expect(page.locator("[data-plan-task-estimate='FUL-202']")).toHaveValue("5");
		await expect(page.locator("[data-estimate-total]")).toContainText("Total points: 13");
	});

	test("modules section toggles availability and adds new entries with category and lead", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-module-row='mod_payments']")).toBeVisible();
		await expect(page.locator("[data-module-category-tag='mod_payments']")).toContainText("feature");

		await page.locator("[data-modules-enable]").uncheck();
		await expect(page.locator("[data-modules-disabled]")).toBeVisible();
		await expect(page.locator("[data-module-add]")).toBeDisabled();

		await page.locator("[data-modules-enable]").check();
		await page.locator("[data-module-name]").fill("Security review");
		await page.locator("[data-module-category]").selectOption("research");
		await page.locator("[data-module-lead]").fill("nina");
		await page.locator("[data-module-add]").click();
		await expect(page.locator("[data-module-row='mod_security_review']")).toBeVisible();
		await expect(page.locator("[data-module-category-tag='mod_security_review']")).toContainText("research");
		await expect(page.locator("[data-module-lead-tag='mod_security_review']")).toContainText("nina");
	});

	test("project feature toggles add and remove nav preview entries", async ({ page }) => {
		await page.goto("/project-settings");

		await expect(page.locator("[data-feature-row='cycles']")).toHaveAttribute("data-feature-enabled", "true");
		await expect(page.locator("[data-feature-nav-item='cycles']")).toBeVisible();
		await expect(page.locator("[data-feature-nav-item='intake']")).toHaveCount(0);

		await page.locator("[data-feature-toggle='cycles']").click();
		await expect(page.locator("[data-feature-row='cycles']")).toHaveAttribute("data-feature-enabled", "false");
		await expect(page.locator("[data-feature-nav-item='cycles']")).toHaveCount(0);

		await page.locator("[data-feature-toggle='intake']").click();
		await expect(page.locator("[data-feature-row='intake']")).toHaveAttribute("data-feature-enabled", "true");
		await expect(page.locator("[data-feature-nav-item='intake']")).toBeVisible();
	});
});
