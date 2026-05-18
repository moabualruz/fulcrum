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

		const overflow = await page.locator("[data-mobile-capture]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
