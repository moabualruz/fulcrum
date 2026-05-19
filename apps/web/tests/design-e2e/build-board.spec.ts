import { expect, test } from "@playwright/test";

test.describe("build board design reference", () => {
	test("renders OD-backed board controls, filters, task cards, and empty reference", async ({ page }) => {
		await page.goto("/build-board");

		await expect(page.locator("[data-build-board]")).toBeVisible();
		await expect(page.locator("[data-build-board-header]")).toContainText("Authentication rewrite board");
		await expect(page.locator("[data-build-layout='board']")).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-build-board-group]")).toBeVisible();
		await expect(page.locator("[data-build-board-sort]")).toBeVisible();
		await expect(page.locator("[data-build-board-properties]")).toBeVisible();
		await expect(page.locator("[data-build-board-new-task]")).toContainText("New task");

		await expect(page.locator("[data-build-filter-active]")).toHaveCount(2);
		await expect(page.locator("[data-build-filter]")).toHaveCount(4);
		await expect(page.locator("[data-build-board-summary]")).toContainText("6 tasks");

		await expect(page.locator("[data-build-board-empty-reference] [data-slot='empty-state']")).toBeVisible();
		await expect(page.locator("[data-build-board-empty-reference]")).toContainText("No tasks on the board");
		await expect(page.locator("[data-build-board-empty-reference]")).toContainText("Create project");

		await expect(page.locator("[data-project-setup-flow]")).toBeVisible();
		await expect(page.locator("[data-project-setup-flow]")).toContainText("Create a workflow container");
		await expect(page.locator("[data-project-name-field] input")).toHaveAttribute("aria-invalid", "true");
		await expect(page.locator("[data-project-validation]")).toContainText("Project name is required.");
		await expect(page.locator("[data-project-repo-field] input")).toHaveValue("github.com/acme/auth-service");
		await expect(page.locator("[data-project-template]")).toHaveCount(3);
		await expect(page.locator("[data-project-template-panel]")).toContainText("Agent workflow");
		await expect(page.locator("[data-project-next-actions] a")).toHaveText([
			"Open overview",
			"Open board",
			"Open settings",
		]);

		const columns = page.locator("[data-build-column]");
		await expect(columns).toHaveCount(4);
		await expect(page.locator("[data-build-column='queued'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Queued");
		await expect(page.locator("[data-build-column='running'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Running");
		await expect(page.locator("[data-build-column='blocked'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Blocked");
		await expect(page.locator("[data-build-column='completed'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Completed");

		const cards = page.locator("[data-build-task-card]");
		await expect(cards).toHaveCount(6);
		await expect(page.locator("[data-task-key='AUTH-42']")).toContainText("Add kid and rotate flag");
		await expect(page.locator("[data-task-key='AUTH-43']")).toContainText("run_8f29a4c");
		await expect(page.locator("[data-task-key='AUTH-51']")).toContainText("approval queue");
		await expect(page.locator("[data-task-key='AUTH-42'] [data-slot='mode-row-option']")).toHaveCount(3);
	});

	test("keeps the board usable on mobile without page-level overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-board");

		await expect(page.locator("[data-build-board-new-task]")).toBeVisible();
		await expect(page.locator("[data-project-setup-flow]")).toBeVisible();
		await expect(page.locator("[data-project-template]")).toHaveCount(3);
		await expect(page.locator("[data-build-board-scroll]")).toBeVisible();
		const pageOverflow = await page
			.locator("[data-build-board]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(pageOverflow).toBeLessThanOrEqual(1);
		const scrollable = await page
			.locator("[data-build-board-scroll]")
			.evaluate((element) => element.scrollWidth > element.clientWidth);
		expect(scrollable).toBe(true);
	});
});
