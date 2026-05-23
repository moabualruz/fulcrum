import { expect, test } from "@playwright/test";

test.describe("run detail fixture", () => {
	test("shows live state, workflow links, readable stream, actions, artifacts, and diff trace", async ({ page }) => {
		await page.goto("/run-detail");

		await expect(page.locator("[data-run-detail-fixture]")).toBeVisible();
		await expect(page.locator("[data-run-workflow-summary]")).toBeVisible();
		await expect(page.locator("[data-run-live-state]")).toContainText("running");
		await expect(page.locator("[data-run-workflow-link]")).toHaveAttribute("href", "/projects/project_alpha/runs");
		await expect(page.locator("[data-run-trace-link]")).toContainText("trace_run_01HYZ");
		await expect(page.locator("[data-runs-cancel-trigger]")).toBeVisible();
		await expect(page.locator("[data-runs-retry-trigger]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-live-session]")).toBeVisible();
		await expect(page.locator("[data-live-session-disconnect]")).toContainText("polling");
		await expect(page.locator("[data-tool-call-timeline] [data-live-session-item]")).toHaveCount(4);
		await expect(page.locator("[data-tool-call-card]")).toContainText("apply_patch");
		await expect(page.locator("[data-diff-preview]")).toContainText("Diff preview");
		await expect(page.locator("[data-approval-gate]")).toContainText("Approval gate");
		await expect(page.locator("[data-live-file-diff-pane]")).toBeVisible();
		await expect(page.locator("[data-live-unified-diff]")).toContainText("live state");
		await expect(page.locator("[data-runs-artifacts] article")).toHaveCount(2);
		await expect(page.locator("[data-runs-artifact-archive]")).toHaveCount(2);
		await expect(page.locator("[data-runs-artifact-promote-memory]")).toHaveCount(2);
	});

	test("keeps run detail usable on mobile without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/run-detail");

		await expect(page.locator("[data-run-workflow-summary]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-live-session]")).toBeVisible();
		const overflow = await page.locator("[data-run-detail-fixture]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
