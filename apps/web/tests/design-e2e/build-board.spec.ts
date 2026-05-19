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

		await expect(page.locator("[data-workspace-integrations]")).toContainText("Integrations and webhooks");
		await expect(page.locator("[data-integration-card]")).toHaveCount(3);
		await expect(page.locator("[data-integration-card='slack']")).toContainText("Connected");
		await expect(page.locator("[data-integration-card='github']")).toContainText("Needs review");
		await expect(page.locator("[data-integration-card='jira']")).toContainText("Connect Jira");
		await expect(page.locator("[data-webhook-url]")).toContainText("whsec_");
		await expect(page.locator("[data-webhook-events]")).toContainText("issue.created");
		await expect(page.locator("[data-webhook-events]")).toContainText("artifact.accepted");
		await expect(page.locator("[data-integration-log-row]")).toHaveCount(4);
		await expect(page.locator("[data-integration-log]")).toContainText("401");
		await expect(page.locator("[data-integration-log]")).toContainText("receiver timeout");

		await page.locator("[data-webhook-test]").click();
		await expect(page.locator("[data-webhook-test-status]")).toContainText("Dry-run sent");
		await page.locator("[data-webhook-rotate]").click();
		await expect(page.locator("[data-webhook-test-status]")).toContainText("dry-run required");
		await page.locator("[data-api-token-copy]").click();
		await expect(page.locator("[data-api-token-copy-state]")).toContainText("Copied to clipboard");
		await page.locator("[data-api-token-revoke]").click();
		await expect(page.locator("[data-api-token-panel]")).toContainText("Revoked");
		await expect(page.locator("[data-api-token-copy]")).toBeDisabled();

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

	test("inline new-task row appears, validates required title, and cancels with Escape", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");
		const trigger = queuedColumn.locator("[data-build-board-new-task-trigger]");
		await expect(trigger).toBeVisible();
		await expect(trigger).toContainText("New task");

		await trigger.click();

		const row = queuedColumn.locator("[data-build-board-new-task-row]");
		await expect(row).toBeVisible();

		const input = row.locator("[data-build-board-new-task-input]");
		await expect(input).toBeFocused();
		await expect(input).not.toHaveAttribute("aria-invalid", "true");
		await expect(row.locator("[data-build-board-new-task-error]")).toHaveCount(0);

		await input.press("Enter");
		await expect(input).toHaveAttribute("aria-invalid", "true");
		await expect(row.locator("[data-build-board-new-task-error]")).toContainText("Title is required.");

		await input.fill("Persist refresh-token rotation");
		await expect(input).not.toHaveAttribute("aria-invalid", "true");
		await expect(row.locator("[data-build-board-new-task-error]")).toHaveCount(0);

		await input.press("Escape");
		await expect(row).toHaveCount(0);
		await expect(trigger).toBeVisible();

		await trigger.click();
		const inputAgain = queuedColumn.locator("[data-build-board-new-task-input]");
		await expect(inputAgain).toBeFocused();
		await inputAgain.fill("Persist refresh-token rotation");
		await inputAgain.press("Enter");

		await expect(queuedColumn.locator("[data-build-board-new-task-row]")).toHaveCount(0);
		await expect(queuedColumn.locator("[data-build-board-new-task-trigger]")).toBeVisible();
	});

	test("optimistic create renders pending ghost, surfaces inline error + Retry on simulated failure", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");

		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const input = queuedColumn.locator("[data-build-board-new-task-input]");
		await input.fill("Persist refresh-token rotation");
		await input.press("Enter");

		const successCard = queuedColumn.locator("[data-build-task-optimistic]");
		await expect(successCard).toHaveCount(1);
		await expect(successCard).toContainText("Persist refresh-token rotation");
		await expect(successCard).toHaveAttribute("data-pending", "true");
		await expect(successCard).not.toHaveAttribute("data-failed", "true");
		await expect(successCard).toHaveCount(0, { timeout: 5_000 });

		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const failInput = queuedColumn.locator("[data-build-board-new-task-input]");
		await failInput.fill("force-fail token rotation");
		await failInput.press("Enter");

		const failedCard = queuedColumn.locator("[data-build-task-optimistic][data-failed='true']");
		await expect(failedCard).toHaveCount(1);
		await expect(failedCard.locator("[data-build-task-error]")).toContainText("HTTP 500");
		await expect(failedCard.locator("[data-build-task-error-trace]")).toContainText("tr_optimistic_5xx");

		await failedCard.locator("[data-build-task-undo]").click();
		await expect(failedCard).toHaveCount(0);
	});

	test("optimistic rollback escalates after 3 retries with expanded payload + troubleshooting link", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");

		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const input = queuedColumn.locator("[data-build-board-new-task-input]");
		await input.fill("force-fail rotation kid");
		await input.press("Enter");

		const card = queuedColumn.locator("[data-build-task-optimistic][data-failed='true']");
		await expect(card).toHaveCount(1);
		await expect(card.locator("[data-build-task-error]"))
			.toHaveAttribute("data-build-task-error-attempts", "1");
		await expect(card.locator("[data-build-task-error]"))
			.not.toHaveAttribute("data-build-task-error-escalated", "true");
		await expect(card.locator("[data-build-task-error-payload]")).toHaveCount(0);

		await card.locator("[data-build-task-retry]").click();
		await expect(card.locator("[data-build-task-error]"))
			.toHaveAttribute("data-build-task-error-attempts", "2", { timeout: 5_000 });
		await expect(card.locator("[data-build-task-error-payload]")).toHaveCount(0);

		await card.locator("[data-build-task-retry]").click();
		await expect(card.locator("[data-build-task-error]"))
			.toHaveAttribute("data-build-task-error-escalated", "true", { timeout: 5_000 });
		await expect(card.locator("[data-build-task-error]"))
			.toHaveAttribute("data-build-task-error-attempts", "3");

		const payload = card.locator("[data-build-task-error-payload]");
		await expect(payload).toBeVisible();
		await expect(payload).toContainText("attempt 3");
		await expect(payload).toContainText("force-fail rotation kid");

		const actions = card.locator("[data-build-task-error-actions]");
		await expect(actions).toContainText("Check network");
		await expect(actions).toContainText("View logs");

		const trouble = card.locator("[data-build-task-error-troubleshooting]");
		await expect(trouble).toContainText("View troubleshooting");
		await expect(trouble).toHaveAttribute("href", /troubleshooting/);

		await card.locator("[data-build-task-undo]").click();
		await expect(card).toHaveCount(0);
	});

	test("keeps the board usable on mobile without page-level overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-board");

		await expect(page.locator("[data-build-board-new-task]")).toBeVisible();
		await expect(page.locator("[data-project-setup-flow]")).toBeVisible();
		await expect(page.locator("[data-workspace-integrations]")).toBeVisible();
		await expect(page.locator("[data-webhook-panel]")).toBeVisible();
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
