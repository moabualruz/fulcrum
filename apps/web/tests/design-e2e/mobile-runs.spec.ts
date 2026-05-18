import { expect, test } from "@playwright/test";

test.describe("mobile-runs error detail panel", () => {
	test("lists failing events with severity, message, and timestamp", async ({ page }) => {
		await page.goto("/mobile-runs");

		await expect(page.locator("[data-mobile-runs-header]")).toContainText("Run errors");
		await expect(page.locator("[data-error-list]")).toBeVisible();
		await expect(page.locator("[data-error-item='err_trace_dedupe']")).toContainText("Dedupe trace-id propagation failed");
		await expect(page.locator("[data-error-item='err_trace_dedupe']")).toContainText("2026-05-19T08:14:22Z");
		await expect(page.locator("[data-error-item='err_mcp_handshake']")).toContainText("handshake timeout");
	});

	test("opens detail with stack, breadcrumbs, related events and copy control", async ({ page }) => {
		await page.goto("/mobile-runs");

		await page.locator("[data-error-open='err_trace_dedupe']").click();
		const detail = page.locator("[data-error-detail='err_trace_dedupe']");
		await expect(detail).toBeVisible();
		await expect(detail).toHaveAttribute("role", "dialog");
		await expect(page.locator("[data-error-detail-message]")).toContainText("Dedupe trace-id propagation failed");
		await expect(page.locator("[data-error-detail-timestamp]")).toContainText("2026-05-19T08:14:22Z");
		await expect(page.locator("[data-error-detail-severity]")).toContainText("error");

		const stack = page.locator("[data-error-detail-stack]");
		await expect(stack).toContainText("TraceError: trace-id mismatch on outbox flush");
		await expect(stack).toContainText("at OutboxConsumer.flush");

		await expect(page.locator("[data-breadcrumb='0']")).toContainText("session.create acp-9f3");
		await expect(page.locator("[data-breadcrumb='3']")).toContainText("trace-id missing on event");

		await expect(page.locator("[data-related-link='run_acp_9f3']")).toHaveAttribute("href", "/runs/acp_9f3");
		await expect(page.locator("[data-related-link='ses_acp_9f3']")).toHaveAttribute("href", "/sessions/acp_9f3");
		await expect(page.locator("[data-error-detail-source]")).toHaveAttribute("href", "/runs/acp_9f3#err_trace_dedupe");
		await expect(page.locator("[data-error-detail-copy]")).toBeVisible();
	});

	test("close button hides the detail panel without reopening on next click", async ({ page }) => {
		await page.goto("/mobile-runs");

		await page.locator("[data-error-open='err_mcp_handshake']").click();
		await expect(page.locator("[data-error-detail='err_mcp_handshake']")).toBeVisible();
		await page.locator("[data-error-detail-close]").click();
		await expect(page.locator("[data-error-detail='err_mcp_handshake']")).toHaveCount(0);
	});

	test("breadcrumbs show the prior 4 events for the selected error", async ({ page }) => {
		await page.goto("/mobile-runs");

		await page.locator("[data-error-open='err_trace_dedupe']").click();
		await expect(page.locator("[data-error-detail-breadcrumbs] [data-breadcrumb]")).toHaveCount(4);
	});
});
