import { expect, test } from "@playwright/test";

test.describe("task detail panel", () => {
	test("supports inline title, description, properties, comments, activity, and runs", async ({ page }) => {
		await page.goto("/comments");
		await expect(page.locator("[data-comments-page]")).toHaveAttribute("data-hydrated", "true");

		await expect(page.locator("[data-comments-header]")).toContainText("Task context panel");
		await expect(page.locator("[data-task-detail-panel]")).toBeVisible();
		await expect(page.locator("[data-testid=task-title]")).toContainText("FUL-132");

		await page.locator("[data-testid=task-title]").click();
		await expect(page.locator("[data-task-title-input]")).toBeFocused();
		await page.locator("[data-task-title-input]").fill("FUL-132 Validate edited task evidence");
		await expect(page.locator("[data-title-save-state]")).toContainText("saving");
		await expect(page.locator("[data-title-save-state]")).toContainText("saved", { timeout: 1500 });

		await page.locator("[data-task-description-input]").fill("Updated detail text with QA run context.");
		await expect(page.locator("[data-description-save-state]")).toContainText("saving");
		await expect(page.locator("[data-description-save-state]")).toContainText("saved", { timeout: 1500 });

		await page.locator("[data-property-state]").selectOption("done");
		await page.locator("[data-property-priority]").selectOption("high");
		await page.locator("[data-property-assignee]").selectOption("omar");
		await page.locator("[data-property-sprint]").selectOption("cycle-15");
		await page.locator("[data-property-module]").selectOption("runs");

		await expect(page.locator("[data-current-state]")).toContainText("Done");
		await expect(page.locator("[data-current-priority]")).toContainText("High");
		await expect(page.locator("[data-property-summary]")).toContainText("Omar owns Cycle 15");
		await expect(page.locator("[data-comments-thread] [data-comment]")).toHaveCount(2);
		await expect(page.locator("[data-related-item]")).toHaveCount(2);
		await expect(page.locator("[data-run-item]")).toHaveCount(2);

		await page.locator("[data-activity-tab]").click();
		await expect(page.locator("[data-activity-log] [data-activity-event]")).toHaveCount(3);
		await expect(page.locator("[data-activity-log]")).toContainText("Todo -> In Review");
	});

	test("keeps the task detail panel usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/comments");
		await expect(page.locator("[data-comments-page]")).toHaveAttribute("data-hydrated", "true");

		await expect(page.locator("[data-task-detail-panel]")).toBeVisible();
		await page.locator("[data-testid=task-title]").click();
		await page.locator("[data-task-title-input]").fill("FUL-132 Mobile detail title edit");
		await page.locator("[data-property-state]").selectOption("in-progress");
		await page.locator("[data-activity-tab]").click();
		await expect(page.locator("[data-activity-log]")).toBeVisible();

		const overflow = await page.locator("[data-comments-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
