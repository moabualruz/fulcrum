import { expect, test } from "@playwright/test";

const workflowStages = [
	["docs", "Send to planning"],
	["planning", "Open prototype review"],
	["execution", "Dispatch first task"],
	["review", "Request code review"],
	["uat", "Resolve review blockers"],
	["e2e", "Run generated E2E"],
] as const;

test.describe("plan review workflow navigation", () => {
	test("makes the primary workflow path discoverable with stage next actions", async ({ page }) => {
		await page.goto("/plan-review");

		await expect(page.locator("[data-plan-review-page]")).toBeVisible();
		await expect(page.locator("[data-primary-workflow-path]")).toBeVisible();
		await expect(page.locator("[data-workflow-stage]")).toHaveCount(6);
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("Docs");
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("Planning");
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("Execution");
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("Review");
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("UAT");
		await expect(page.locator("[data-breadcrumb-trail]")).toContainText("E2E");

		for (const [stage, nextAction] of workflowStages) {
			await page.locator(`[data-workflow-stage='${stage}']`).click();
			await expect(page.locator(`[data-workflow-stage='${stage}']`)).toHaveAttribute("data-selected", "true");
			await expect(page.locator("[data-next-action]")).toContainText(nextAction);
			await expect(page.locator(`[data-stage-next-action='${stage}']`)).toContainText(nextAction);
		}
	});

	test("preserves workflow context and stays usable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/plan-review");

		await expect(page.locator("[data-workflow-context]")).toContainText("trace_9f73");
		await expect(page.locator("[data-context-preservation]")).toContainText("acme-auth");
		await expect(page.locator("[data-context-preservation]")).toContainText("plan_42");
		await expect(page.locator("[data-context-preservation]")).toContainText("trace_9f73");
		await expect(page.locator("[data-open-stage-action]")).toBeVisible();
		const routeOverflow = await page
			.locator("[data-plan-review-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(routeOverflow).toBeLessThanOrEqual(1);
	});

	test("builds, validates, previews, and saves automation rules", async ({ page }) => {
		await page.goto("/plan-review");

		await expect(page.locator("[data-automation-rule-builder]")).toBeVisible();
		await page.locator("[data-rule-trigger]").selectOption("state_changed");
		await page.locator("[data-rule-condition-field]").selectOption("state");
		await page.locator("[data-rule-condition-value]").fill("Done");
		await page.locator("[data-rule-action]").selectOption("archive");
		await page.locator("[data-preview-rule]").click();
		await expect(page.locator("[data-rule-preview-text]")).toContainText("AUTH-42");
		await expect(page.locator("[data-rule-preview-text]")).toContainText("state_changed");
		await page.locator("[data-save-rule]").click();
		await expect(page.locator("[data-saved-rule='rule-2']")).toBeVisible();
		await expect(page.locator("[data-saved-rule-action='rule-2']")).toContainText("archive");

		await page.locator("[data-rule-trigger]").selectOption("cycle_started");
		await page.locator("[data-rule-condition-field]").selectOption("state");
		await page.locator("[data-preview-rule]").click();
		await expect(page.locator("[data-rule-validation]")).toContainText("Cycle triggers cannot validate issue fields");
		await expect(page.locator("[data-rule-preview-text]")).toContainText("Preview blocked");

		await page.locator("[data-rule-condition-field]").selectOption("cycle");
		await page.locator("[data-rule-condition-value]").fill("May sprint");
		await page.locator("[data-rule-action]").selectOption("close_state");
		await page.locator("[data-preview-rule]").click();
		await expect(page.locator("[data-rule-status]")).toContainText("valid");
		await expect(page.locator("[data-rule-preview-text]")).toContainText("cycle_started");
	});
});
