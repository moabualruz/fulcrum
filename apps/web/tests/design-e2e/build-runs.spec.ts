import { expect, test } from "@playwright/test";

test.describe("code review loop", () => {
	test("loads each diff source and preserves base/head identity", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-build-runs-review]")).toBeVisible();
		await expect(page.locator("[data-review-base]")).toHaveText("workspace:index");
		await expect(page.locator("[data-review-head]")).toHaveText("workspace:working-tree");

		await page.locator("[data-diff-source='staged']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("HEAD");
		await expect(page.locator("[data-review-head]")).toHaveText("index");

		await page.locator("[data-diff-source='branch']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("dev/v1.0");
		await expect(page.locator("[data-review-head]")).toHaveText("feat/review-loop");

		await page.locator("[data-diff-source='pull']").click();
		await expect(page.locator("[data-review-base]")).toHaveText("origin/dev/v1.0");
		await expect(page.locator("[data-review-head]")).toHaveText("review/42/head");
	});

	test("anchors inline comments to file path and line range", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-annotate-line='142']").click();
		await expect(page.locator("[data-annotation-range]")).toHaveText(
			"services/planning-review/src/application/reviews/review-workbench.ts:142-142",
		);
		await page.locator("[data-annotation-text]").fill("Return actionable retry guidance to the agent.");
		await expect(page.locator("[data-feedback-payload]")).toContainText("review-workbench.ts");
		await expect(page.locator("[data-feedback-payload]")).toContainText("Return actionable retry guidance");
	});

	test("exports feedback to a follow-up agent run and records approval identity", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-annotate-line='85']").click();
		await page.locator("[data-feedback-destination]").selectOption("local-agent");
		await page.locator("[data-send-feedback]").click();
		await expect(page.locator("[data-feedback-run]")).toContainText(
			"apps/web/src/routes/runs/[id]/+page.svelte:85-85",
		);

		await page.locator("[data-approve-diff]").click();
		await expect(page.locator("[data-approval-record]")).toContainText("workspace:index -> workspace:working-tree");
		await expect(page.locator("[data-approval-record]")).toContainText("85-85");
	});

	test("keeps review workbench usable on mobile without horizontal page overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-runs");

		await expect(page.locator("[data-diff-source-picker]")).toBeVisible();
		await expect(page.locator("[data-review-sidebar]")).toBeVisible();
		const overflow = await page.locator("[data-build-runs-review]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test("shows pending automated feedback runs and latest verdicts", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-qa-feedback-gate]")).toBeVisible();
		await expect(page.locator("[data-run-status='qa-feedback-17']")).toHaveText("running");
		await expect(page.locator("[data-run-status='implementation-feedback-18']")).toHaveText("failed");
		await expect(page.locator("[data-latest-verdict='qa-feedback-17']")).toContainText("REVISE");
		await expect(page.locator("[data-latest-verdict='review-feedback-19']")).toContainText("APPROVE");
	});

	test("links annotation feedback to independent agent job logs and summaries", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-agent-job-panel]")).toBeVisible();
		await expect(page.locator("[data-agent-job-for-annotation]")).toHaveText(
			"apps/web/src/routes/runs/[id]/+page.svelte:85-85",
		);
		await expect(page.locator("[data-agent-job-tab='qa-feedback-17']")).toBeVisible();
		await expect(page.locator("[data-agent-job-tab='review-feedback-19']")).toBeVisible();
		await expect(page.locator("[data-agent-job-summary]")).toContainText("artifact proof");
		await expect(page.locator("[data-agent-job-result]")).toContainText("Still running");
		await expect(page.locator("[data-agent-job-log]")).toHaveCount(3);

		await page.locator("[data-annotation-text]").fill("Keep this text stable while logs stream.");
		await page.locator("[data-append-job-log]").click();
		await expect(page.locator("[data-agent-job-log]")).toHaveCount(4);
		await expect(page.locator("[data-annotation-text]")).toHaveValue("Keep this text stable while logs stream.");
	});

	test("offers retry or blocked action when a feedback job fails", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-annotate-line='142']").click();
		await expect(page.locator("[data-agent-job-tab='implementation-feedback-18']")).toBeVisible();
		await expect(page.locator("[data-agent-job-status]")).toHaveText("failed");
		await expect(page.locator("[data-agent-job-result]")).toContainText("Failed:");

		await page.locator("[data-retry-job]").click();
		await expect(page.locator("[data-agent-job-status]")).toHaveText("pending");
		await expect(page.locator("[data-agent-job-result]")).toContainText("Retry queued");

		await page.locator("[data-mark-job-blocked]").click();
		await expect(page.locator("[data-job-blocker-record]")).toContainText("implementation-feedback-18");
	});

	test("keeps UAT disabled while retryable QA feedback exists then unlocks after exhaustion", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-start-uat]")).toBeDisabled();
		await expect(page.locator("[data-gate-explanation]")).toContainText("retryable QA feedback exists");

		await page.locator("[data-gate-exhausted]").click();
		await expect(page.locator("[data-start-uat]")).toBeEnabled();
		await expect(page.locator("[data-gate-explanation]")).toContainText("automation exhausted after 3 attempts");
	});

	test("requires blocked reason and owner before recording a blocked state", async ({ page }) => {
		await page.goto("/build-runs");

		await page.locator("[data-gate-blocked]").click();
		await expect(page.locator("[data-record-blocked]")).toBeDisabled();
		await page.locator("[data-blocked-reason]").fill("Reviewer unavailable");
		await expect(page.locator("[data-record-blocked]")).toBeDisabled();
		await page.locator("[data-blocked-owner]").fill("qa-lead");
		await expect(page.locator("[data-record-blocked]")).toBeEnabled();
		await expect(page.locator("[data-blocked-record]")).toContainText("qa-lead");
		await expect(page.locator("[data-blocked-record]")).toContainText("Reviewer unavailable");
	});

	test("records why automation is exhausted before approval", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-record-exhaustion]")).toBeDisabled();
		await page.locator("[data-gate-exhausted]").click();
		await page.locator("[data-exhaustion-reason]").fill("QA, task, and review agents reached retry cap with passing final verdicts.");
		await page.locator("[data-record-exhaustion]").click();
		await expect(page.locator("[data-exhaustion-record]")).toContainText(
			"QA, task, and review agents reached retry cap with passing final verdicts.",
		);
	});
});
