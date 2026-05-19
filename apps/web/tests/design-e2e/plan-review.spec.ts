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

	test("previews importer dry-run values before committing imported issues", async ({ page }) => {
		await page.goto("/plan-review");

		await expect(page.locator("[data-importer-dry-run]")).toBeVisible();
		await expect(page.locator("[data-import-total-count]")).toContainText("12");
		await expect(page.locator("[data-import-preview-count]")).toContainText("10");
		await expect(page.locator("[data-import-attachment-count]")).toContainText("19");
		await expect(page.locator("[data-import-preview-issue]")).toHaveCount(10);

		await expect(page.locator("[data-import-field-map='Jira Summary']")).toContainText("Renew enterprise contract");
		await expect(page.locator("[data-import-user-map-target='ada@acme.test']")).toHaveValue("Ada Lovelace");
		await expect(page.locator("[data-import-preview-title='JIRA-101']")).toContainText("Renew enterprise contract");
		await expect(page.locator("[data-import-preview-values='JIRA-101']")).toContainText("title: Renew enterprise contract");
		await expect(page.locator("[data-import-preview-assignee='JIRA-101']")).toContainText("Ada Lovelace");
		await expect(page.locator("[data-import-preview-attachments='JIRA-101']")).toContainText("3");

		await page.locator("[data-run-import-dry-run]").click();
		await expect(page.locator("[data-importer-dry-run-status]")).toContainText("Preview ready");
		await expect(page.locator("[data-import-dry-run-message]")).toContainText("Preview shows 10 of 12 issues");
		await expect(page.locator("[data-import-summary-sample]")).toContainText("10 of 12");
		await expect(page.locator("[data-import-summary-users]")).toContainText("3 mapped users");
		await expect(page.locator("[data-import-summary-attachments]")).toContainText("19 attachments");

		await page.locator("[data-back-to-import-mapping]").click();
		await expect(page.locator("[data-importer-dry-run-status]")).toContainText("Mapping");
		await page.locator("[data-import-field-map-target='Jira Summary']").fill("name");
		await page.locator("[data-import-user-map-target='ada@acme.test']").fill("Ada L.");
		await page.locator("[data-run-import-dry-run]").click();
		await expect(page.locator("[data-import-preview-values='JIRA-101']")).toContainText("name: Renew enterprise contract");
		await expect(page.locator("[data-import-preview-assignee='JIRA-101']")).toContainText("Ada L.");

		await page.locator("[data-proceed-import]").click();
		await expect(page.locator("[data-importer-dry-run-status]")).toContainText("Import queued");
		await expect(page.locator("[data-import-proceed-state]")).toContainText("queued");

		await page.locator("[data-cancel-import]").click();
		await expect(page.locator("[data-importer-dry-run-status]")).toContainText("Cancelled");
		await expect(page.locator("[data-import-dry-run-message]")).toContainText("Import cancelled");
	});

	test("uploads CSV, detects columns, previews rows, and reports row errors", async ({ page }) => {
		await page.goto("/plan-review");

		const csv = [
			"Summary,Description,Status,Priority,Owner,Points",
			"Renew contract,Enterprise renewal,In Review,High,Ada,5",
			"Add audit export,CSV export,Todo,Medium,Grace,3",
			"Stabilize graph tests,Reduce flakes,Blocked,High,Linus,8",
			"Import labels,Map labels,Todo,Low,Ada,2",
			"Review evidence,Attach proof,In Progress,Medium,Grace,5",
			",Missing title,Todo,Low,Ada,1",
		].join("\n");

		await expect(page.locator("[data-csv-importer]")).toBeVisible();
		await expect(page.locator("[data-csv-max-size]")).toContainText("10MB");
		await page.locator("[data-csv-upload]").setInputFiles({
			name: "issues.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(csv),
		});

		await expect(page.locator("[data-csv-file-name]")).toContainText("issues.csv");
		await expect(page.locator("[data-csv-row-count]")).toContainText("6");
		await expect(page.locator("[data-csv-status]")).toContainText("Detected 6 columns");
		await expect(page.locator("[data-csv-column-map='Summary']")).toContainText("Detected: title");
		await expect(page.locator("[data-csv-column-map='Owner']")).toContainText("Detected: assignee");
		await page.locator("[data-csv-column-target='Points']").selectOption("estimate");

		await page.locator("[data-csv-preview]").click();
		await expect(page.locator("[data-csv-status]")).toContainText("Previewing 5 sample rows");
		await expect(page.locator("[data-csv-preview-row]")).toHaveCount(5);
		await expect(page.locator("[data-csv-preview-title='1']")).toContainText("Renew contract");
		await expect(page.locator("[data-csv-preview-state='1']")).toContainText("In Review");
		await expect(page.locator("[data-csv-preview-assignee='1']")).toContainText("Ada");

		await page.locator("[data-csv-import]").click();
		await expect(page.locator("[data-csv-status]")).toContainText("Import report ready");
		await expect(page.locator("[data-csv-progress-value]")).toContainText("100%");
		await expect(page.locator("[data-csv-created-count]")).toContainText("5");
		await expect(page.locator("[data-csv-skipped-count]")).toContainText("1");
		await expect(page.locator("[data-csv-row-errors]")).toContainText("Row 6: title required");
	});

	test("connects GitHub, selects repo, maps collaborators, and preserves PR links", async ({ page }) => {
		await page.goto("/plan-review");

		await expect(page.locator("[data-github-importer]")).toBeVisible();
		await expect(page.locator("[data-github-oauth-status]")).toContainText("OAuth required");
		await expect(page.locator("[data-github-token-storage]")).toContainText("Token encrypted");
		await page.locator("[data-github-connect]").click();
		await expect(page.locator("[data-github-oauth-status]")).toContainText("OAuth connected");

		await page.locator("[data-github-repo-option='acme-fulcrum']").click();
		await expect(page.locator("[data-github-repo-option='acme-fulcrum']")).toHaveAttribute("data-selected", "true");
		await expect(page.locator("[data-github-preview-issue-count]")).toContainText("30");
		await expect(page.locator("[data-github-preview-label-count]")).toContainText("12");
		await expect(page.locator("[data-github-preview-collaborator-count]")).toContainText("10");
		await expect(page.locator("[data-github-preview-archived-count]")).toContainText("2");

		await expect(page.locator("[data-github-preview-title='42']")).toContainText("Preserve PR link");
		await expect(page.locator("[data-github-preview-description='42']")).toContainText("original body");
		await expect(page.locator("[data-github-preview-comments='42']")).toContainText("6");
		await expect(page.locator("[data-github-preview-pr='42']")).toHaveAttribute("href", "https://github.com/acme/fulcrum/pull/42");

		await expect(page.locator("[data-github-user-map='ada-dev']")).toContainText("Ada Lovelace");
		await page.locator("[data-github-user-map-action='linus-build']").selectOption("map");
		await expect(page.locator("[data-github-import-status]")).toContainText("user mapping edited");

		await page.locator("[data-github-import]").click();
		await expect(page.locator("[data-github-import-status]")).toContainText("import complete");
		await expect(page.locator("[data-github-created-count]")).toContainText("28");
		await expect(page.locator("[data-github-comment-count]")).toContainText("84");
		await expect(page.locator("[data-github-pr-link-count]")).toContainText("7");
	});
});
