import { expect, test } from "@playwright/test";

test.describe("mobile-runs error detail panel", () => {
	test("renders provider credential config with masked API key and encrypted storage copy", async ({ page }) => {
		await page.goto("/mobile-runs");

		const panel = page.locator("[data-provider-config-panel]");
		await expect(panel).toContainText("Inference provider");
		await expect(page.locator("[data-provider-name] input")).toHaveValue("Claude");
		await expect(page.locator("[data-provider-api-key] input")).toHaveAttribute("type", "password");
		await expect(page.locator("[data-provider-api-key] input")).toHaveValue("sk-fulcrum-valid-demo");
		await expect(page.locator("[data-provider-base-url] input")).toHaveValue("https://api.anthropic.com");
		await expect(page.locator("[data-provider-timeout] input")).toHaveValue("5000");
		await expect(page.locator("[data-provider-storage-note]")).toContainText("OS credential store");
		await expect(page.locator("[data-provider-storage-note]")).toContainText("encrypted Fulcrum credentials file fallback");
		await expect(page.locator("[data-provider-save]")).toBeDisabled();
		await expect(page.locator("[data-provider-test-result]")).toHaveAttribute("data-provider-status", "idle");
	});

	test("tests valid provider credentials before enabling save", async ({ page }) => {
		await page.goto("/mobile-runs");

		await page.locator("[data-provider-test]").click();
		await expect(page.locator("[data-provider-test-result]")).toHaveAttribute("data-provider-status", "connected");
		await expect(page.locator("[data-provider-latency]")).toContainText("184ms");
		await expect(page.locator("[data-provider-version]")).toContainText("2026-05 provider schema");
		await expect(page.locator("[data-provider-quota]")).toContainText("8241 requests");
		await expect(page.locator("[data-provider-save]")).toBeEnabled();

		await page.locator("[data-provider-save]").click();
		await expect(page.locator("[data-provider-save-state]")).toContainText("Credentials saved after validation.");
	});

	test("keeps invalid provider credentials unsaved with latency and failed reason", async ({ page }) => {
		await page.goto("/mobile-runs");

		await page.locator("[data-provider-api-key] input").fill("invalid-key");
		await page.locator("[data-provider-test]").click();
		await expect(page.locator("[data-provider-test-result]")).toHaveAttribute("data-provider-status", "failed");
		await expect(page.locator("[data-provider-error]")).toContainText("Provider rejected credentials before quota check.");
		await expect(page.locator("[data-provider-latency]")).toContainText("91ms");
		await expect(page.locator("[data-provider-save]")).toBeDisabled();
		await expect(page.locator("[data-provider-save-state]")).toContainText("Credentials not saved.");
	});

	test("keeps provider config usable without mobile horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/mobile-runs");

		await expect(page.locator("[data-provider-config-panel]")).toBeVisible();
		await expect(page.locator("[data-provider-test]")).toBeVisible();
		await expect(page.locator("[data-provider-save]")).toBeVisible();
		const overflow = await page.locator("[data-mobile-runs]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});

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
