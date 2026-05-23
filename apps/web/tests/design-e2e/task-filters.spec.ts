import { expect, test } from "@playwright/test";

test.describe("task filters", () => {
	test("combines rich filters, clears them, and saves filtered views", async ({ page }) => {
		await page.goto("/task-filters");

		await expect(page.locator("[data-task-filters-header]")).toContainText("Task filters");
		await expect(page.locator("[data-persistent-filter-panel]")).toBeVisible();
		await expect(page.locator("[data-filter-count-badge]")).toContainText("3 filters");
		await expect(page.locator("[data-filtered-task]")).toHaveCount(1);

		await page.locator("[data-clear-filters]").click();
		await page.locator("[data-filter-state]").selectOption("In Progress");
		await page.locator("[data-assignee-search]").fill("may");
		await page.locator("[data-assignee-option='Maya']").click();
		await page.locator("[data-label-search]").fill("bug");
		await page.locator("[data-label-chip='bug']").click();
		await page.locator("[data-priority-option='High']").click();
		await page.locator("[data-filter-due-date]").fill("2026-05-22");
		await page.locator("[data-filter-cycle]").selectOption("Cycle 14");
		await page.locator("[data-filter-module]").selectOption("Views");
		await page.locator("[data-filter-custom-severity]").selectOption("S1");
		await page.locator("[data-filter-custom-customer]").selectOption("Acme");

		await expect(page.locator("[data-filter-count-badge]")).toContainText("9 filters");
		await expect(page.locator("[data-active-filter-summary]")).toContainText("State: In Progress");
		await expect(page.locator("[data-active-filter-summary]")).toContainText("Label: bug");
		await expect(page.locator("[data-filtered-task]")).toHaveCount(1);
		await expect(page.locator("[data-filtered-task]").first()).toContainText("FUL-127");

		await page.locator("[data-testid='save-view']").click();
		await expect(page.locator("[data-save-view-modal]")).toBeVisible();
		await expect(page.locator("[data-save-view-preview]")).toContainText("9 active filters");
		await page.locator("[data-saved-view-name]").fill("Critical bug view");
		await page.locator("[data-confirm-save-view]").click();
		await expect(page.locator("[data-saved-view='view-critical-bug-view']")).toBeVisible();
		await expect(page.locator("[data-view-filter-count='view-critical-bug-view']")).toContainText("9 filters");

		await page.locator("[data-clear-filters]").click();
		await expect(page.locator("[data-filter-count-badge]")).toContainText("0 filters");
		await expect(page.locator("[data-filtered-task]")).toHaveCount(4);

		await page.locator("[data-apply-view='view-critical-bug-view']").click();
		await expect(page.locator("[data-filter-count-badge]")).toContainText("9 filters");
		await expect(page.locator("[data-filtered-task]")).toHaveCount(1);
	});

	test("opens save modal, blocks empty views, and edits or deletes saved tabs", async ({ page }) => {
		await page.goto("/task-filters");

		await expect(page.locator("[data-view-scope]")).toContainText("project filter combination");
		await page.locator("[data-clear-filters]").click();
		await page.locator("[data-save-view]").click();
		await expect(page.locator("[data-save-view-modal]")).toHaveAttribute("role", "dialog");
		await expect(page.locator("[data-empty-view-warning]")).toContainText("Add at least one filter");
		await expect(page.locator("[data-confirm-save-view]")).toBeDisabled();
		await page.locator("[data-close-save-view]").click();

		await page.locator("[data-filter-state]").selectOption("In Progress");
		await page.locator("[data-save-view]").click();
		await page.locator("[data-saved-view-name]").fill("Active sprint");
		await page.locator("[data-confirm-save-view]").click();
		await expect(page.locator("[data-saved-view='view-active-sprint']")).toContainText("Active sprint");

		await page.locator("[data-edit-view='view-active-sprint']").click();
		await expect(page.locator("[data-save-view-modal]")).toContainText("Edit saved view");
		await page.locator("[data-saved-view-name]").fill("Blocked review");
		await page.locator("[data-confirm-save-view]").click();
		await expect(page.locator("[data-saved-view='view-active-sprint']")).toContainText("Blocked review");

		await page.locator("[data-delete-view='view-active-sprint']").click();
		await expect(page.locator("[data-saved-view='view-active-sprint']")).toHaveCount(0);
	});

	test("supports OR logic and mobile filter panel without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/task-filters");

		await page.locator("[data-clear-filters]").click();
		await page.locator("[data-logic-mode='or']").click();
		await page.locator("[data-filter-state]").selectOption("Blocked");
		await page.locator("[data-priority-option='Low']").click();

		await expect(page.locator("[data-filtered-task]")).toHaveCount(2);
		await expect(page.locator("[data-persistent-filter-panel]")).toBeVisible();

		const overflow = await page
			.locator("[data-task-filters-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
