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

	test("creates typed custom fields and applies them to issue create and detail", async ({ page }) => {
		await page.goto("/plan-review");

		await expect(page.locator("[data-custom-fields-builder]")).toBeVisible();
		await expect(page.locator("[data-custom-field-type]")).toHaveCount(7);

		await page.locator("[data-custom-field-type='text']").click();
		await page.locator("[data-custom-field-name]").fill("Client Name");
		await page.locator("[data-custom-field-required]").check();
		await page.locator("[data-create-custom-field]").click();
		await expect(page.locator("[data-custom-field='client-name']")).toHaveAttribute("data-custom-field-required-row", "true");

		await page.locator("[data-custom-field-type='number']").click();
		await page.locator("[data-custom-field-name]").fill("Budget");
		await page.locator("[data-custom-field-required]").uncheck();
		await page.locator("[data-custom-field-default]").fill("0");
		await page.locator("[data-create-custom-field]").click();
		await expect(page.locator("[data-custom-field='budget']")).toHaveAttribute("data-custom-field-type-row", "number");
		await expect(page.locator("[data-custom-field-default-row='budget']")).toContainText("0");

		await page.locator("[data-custom-field-type='date']").click();
		await page.locator("[data-custom-field-name]").fill("Review Date");
		await page.locator("[data-custom-field-default]").fill("2026-05-19");
		await page.locator("[data-create-custom-field]").click();
		await expect(page.locator("[data-custom-field='review-date']")).toHaveAttribute("data-custom-field-type-row", "date");

		await page.locator("[data-custom-field-type='select']").click();
		await page.locator("[data-custom-field-name]").fill("Priority Choice");
		await page.locator("[data-custom-field-options]").fill("Low, Medium, High");
		await page.locator("[data-custom-field-default]").fill("Medium");
		await page.locator("[data-create-custom-field]").click();
		await expect(page.locator("[data-custom-field='priority-choice']")).toHaveAttribute("data-custom-field-type-row", "select");

		await page.locator("[data-issue-title]").fill("Renew enterprise contract");
		await page.locator("[data-create-issue-with-fields]").click();
		await expect(page.locator("[data-custom-field-validation]")).toContainText("Client Name is required");
		await page.locator("[data-issue-field-input='client-name']").fill("Acme");
		await page.locator("[data-create-issue-with-fields]").click();
		await expect(page.locator("[data-created-issue-title]")).toContainText("Renew enterprise contract");
		await expect(page.locator("[data-issue-detail-field='Client Name']")).toContainText("Acme");
		await expect(page.locator("[data-issue-detail-field='Budget']")).toContainText("0");
		await expect(page.locator("[data-issue-detail-field='Priority Choice']")).toContainText("Medium");
	});
});
