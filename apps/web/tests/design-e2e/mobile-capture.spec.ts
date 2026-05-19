import { expect, test } from "@playwright/test";

test.describe("mobile capture web vitals", () => {
	test("shows green LCP, INP, CLS budgets and telemetry sends when opted in", async ({ page }) => {
		const telemetryPayloads: unknown[] = [];
		await page.route("**/api/v1/telemetry/events", async (route) => {
			telemetryPayloads.push(route.request().postDataJSON());
			await route.fulfill({ status: 204, body: "" });
		});
		await page.addInitScript(() => localStorage.setItem("fulcrum.telemetry", "on"));
		await page.goto("/mobile-capture");

		await expect(page.locator("[data-mobile-capture]")).toHaveAttribute("data-hydrated", "true");
		await expect(page.locator("[data-lighthouse-score]")).toContainText("96");
		await expect(page.locator("[data-vital-card='LCP'] [data-vital-state]")).toContainText("Green");
		await expect(page.locator("[data-vital-card='INP'] [data-vital-state]")).toContainText("Green");
		await expect(page.locator("[data-vital-card='CLS'] [data-vital-state]")).toContainText("Green");
		await expect(page.locator("[data-long-task-count]")).toContainText("0 over 50 ms");
		await expect(page.locator("[data-send-count]")).toContainText("3 metric events");
		expect(telemetryPayloads).toHaveLength(3);
		expect(telemetryPayloads).toEqual(expect.arrayContaining([
			expect.objectContaining({ kind: "web_vital", route: "/mobile-capture", metric: "LCP", budget: 2500 }),
			expect.objectContaining({ kind: "web_vital", route: "/mobile-capture", metric: "INP", budget: 200 }),
			expect.objectContaining({ kind: "web_vital", route: "/mobile-capture", metric: "CLS", budget: 0.1 }),
		]));
	});

	test("measures interaction without exceeding INP budget", async ({ page }) => {
		await page.goto("/mobile-capture");
		await expect(page.locator("[data-mobile-capture]")).toHaveAttribute("data-hydrated", "true");

		await page.locator("[data-capture-action]").click();
		await expect(page.locator("[data-interaction-state]")).toContainText("Captured");
		await expect(page.locator("[data-vital-card='INP'] [data-vital-state]")).toContainText("Green");

		const inpText = await page.locator("[data-vital-card='INP'] [data-vital-value]").innerText();
		const inpMs = Number.parseInt(inpText, 10);
		expect(inpMs).toBeLessThan(200);
	});

	test("keeps mobile layout stable without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/mobile-capture");

		await expect(page.locator("[data-mobile-workspace]")).toBeVisible();
		await expect(page.locator("[data-performance-contract]")).toBeVisible();
		await expect(page.locator("[data-mobile-workflow-nav]")).toBeVisible();
		await page.locator("[data-mobile-nav-item='review']").click();
		await page.locator("[data-mobile-review-note]").fill("Reviewed on mobile without clipped controls.");
		await page.locator("[data-mobile-status-select]").selectOption("approved");
		await page.locator("[data-mobile-review-submit]").click();
		await expect(page.locator("[data-mobile-status-value]")).toContainText("approved");
		await expect(page.locator("[data-mobile-quick-action-state]")).toContainText("Review saved");
		await page.locator("[data-mobile-quick-action='Block']").click();
		await expect(page.locator("[data-mobile-quick-action-state]")).toContainText("Block");
		await expect(page.locator("[data-mobile-review-table]")).toBeVisible();

		const overflow = await page.locator("[data-mobile-capture]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		const touchTargets = await page.locator("[data-mobile-workflow-nav] button, [data-mobile-review-submit], [data-mobile-quick-action]").evaluateAll((elements) =>
			elements.map((element) => Math.round(element.getBoundingClientRect().height)),
		);
		expect(touchTargets.every((height) => height >= 40)).toBe(true);
	});

	test("quick create preserves view scope, assignments, recurrence preview, and validation state", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/mobile-capture");

		await expect(page.locator("[data-task-quick-create]")).toBeVisible();
		await page.locator("[data-task-create-context='Planning']").click();
		await expect(page.locator("[data-task-quick-create-context]")).toContainText("Planning");
		await expect(page.locator("[data-task-quick-create-scope]")).toContainText("Planning tray · Sprint 18");

		await page.locator("[data-task-quick-create-submit]").click();
		await expect(page.locator("[data-slot='field-error']")).toContainText("Title is required");
		await expect(page.locator("[data-task-quick-create-sprint]")).toHaveValue("Sprint 18");

		await page.locator("[data-task-quick-create-title]").fill("Run capture intake");
		await page.locator("[data-task-quick-create-module]").fill("Capture");
		await page.locator("[data-task-recurrence-toggle]").click();
		await expect(page.locator("[data-task-recurrence-preview]")).toContainText("Weekly on Monday");
		await expect(page.locator("[data-task-recurrence-preview]")).toContainText("Sprint 18");

		await page.locator("[data-task-quick-create-submit]").click();
		await expect(page.locator("[data-task-quick-create-success]")).toContainText("Created in Planning tray");
		await expect(page.locator("[data-task-created-row='Run capture intake']")).toBeVisible();
	});

	test("quick create blocks duplicates and retries failed drafts without clearing context", async ({ page }) => {
		await page.goto("/mobile-capture");

		await page.locator("[data-task-create-context='Backlog']").click();
		await page.locator("[data-task-quick-create-title]").fill("Refresh capture copy");
		await page.locator("[data-task-quick-create-submit]").click();
		await expect(page.locator("[data-task-quick-create-error]")).toContainText("Duplicate task blocked");
		await expect(page.locator("[data-task-quick-create-title]")).toHaveValue("Refresh capture copy");
		await expect(page.locator("[data-task-quick-create-context]")).toContainText("Backlog");

		await page.locator("[data-task-quick-create-title]").fill("Fail offline capture");
		await page.locator("[data-task-quick-create-submit]").click();
		await expect(page.locator("[data-task-quick-create-error]")).toContainText("Draft preserved");
		await expect(page.locator("[data-task-quick-create-retry]")).toBeEnabled();

		await page.locator("[data-task-quick-create-retry]").click();
		await expect(page.locator("[data-task-quick-create-success]")).toContainText("Created in Backlog triage");
		await expect(page.locator("[data-task-created-row='retry offline capture']")).toBeVisible();
	});
});
