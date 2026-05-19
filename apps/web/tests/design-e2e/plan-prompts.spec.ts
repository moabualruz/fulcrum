import { expect, test } from "@playwright/test";

test.describe("project workflow states editor", () => {
	test("creates, validates, moves, colors, defaults, and reorders custom states", async ({ page }) => {
		await page.goto("/plan-prompts");

		await expect(page.locator("[data-project-states-page]")).toBeVisible();
		await expect(page.locator("[data-state-group]")).toHaveCount(5);

		await page.locator("[data-state-name-input]").fill("In Code Review");
		await page.locator("[data-state-group-input]").selectOption("started");
		await page.locator("[data-create-state]").click();
		await expect(page.locator("[data-state-row='in-code-review']")).toBeVisible();
		await expect(page.locator("[data-state-row='in-code-review']")).toHaveAttribute("data-state-group-row", "started");
		await expect(page.locator("[data-state-usage='in-code-review']")).toContainText("0 open issues");

		await page.locator("[data-state-name-input]").fill("In Code Review");
		await page.locator("[data-create-state]").click();
		await expect(page.locator("[data-state-validation]")).toContainText("State name already exists");

		await page.locator("[data-move-state='in-code-review']").selectOption("completed");
		await expect(page.locator("[data-state-row='in-code-review']")).toHaveAttribute("data-state-group-row", "completed");

		await page.locator("[data-color-option='purple']").click();
		await expect(page.locator("[data-state-row='in-code-review']")).toHaveAttribute("data-state-color-row", "purple");
		await expect(page.locator("[data-color-option='purple']")).toHaveAttribute("data-color-selected", "true");

		await page.locator("[data-set-default='in-code-review']").click();
		await expect(page.locator("[data-default-state]")).toContainText("In Code Review");
		await expect(page.locator("[data-state-row='in-code-review']")).toHaveAttribute("data-state-default", "true");

		await page.locator("[data-reorder-up='in-code-review']").click();
		await expect(page.locator("[data-state-last-action]")).toContainText("Reordered In Code Review");
	});

	test("guards deletion when a state has open issues and deletes unused states", async ({ page }) => {
		await page.goto("/plan-prompts");

		await page.locator("[data-delete-state='in-progress']").click();
		await expect(page.locator("[data-delete-state-prompt]")).toBeVisible();
		await expect(page.locator("[data-delete-state-usage]")).toContainText("5 open issues");
		await expect(page.locator("[data-delete-state-warning]")).toContainText("Move or close these issues");
		await expect(page.locator("[data-confirm-delete-state]")).toBeDisabled();

		await page.locator("[data-cancel-delete-state]").click();
		await page.locator("[data-state-name-input]").fill("Ready for QA");
		await page.locator("[data-state-group-input]").selectOption("started");
		await page.locator("[data-create-state]").click();
		await page.locator("[data-delete-state='ready-for-qa']").click();
		await expect(page.locator("[data-confirm-delete-state]")).toBeEnabled();
		await page.locator("[data-confirm-delete-state]").click();
		await expect(page.locator("[data-state-row='ready-for-qa']")).toHaveCount(0);
		await expect(page.locator("[data-state-last-action]")).toContainText("Deleted Ready for QA");
	});

	test("stays inside the route container on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/plan-prompts");

		await expect(page.locator("[data-project-states-page]")).toBeVisible();
		const routeOverflow = await page
			.locator("[data-project-states-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(routeOverflow).toBeLessThanOrEqual(1);
	});
});
