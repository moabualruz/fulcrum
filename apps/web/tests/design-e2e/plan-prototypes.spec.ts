import { expect, test } from "@playwright/test";

test.describe("prototype review design reference", () => {
	test("supports artifact inspection, explicit decisions, and materialization state", async ({ page }) => {
		await page.goto("/plan-prototypes");

		await expect(page.locator("[data-plan-prototypes-page]")).toBeVisible();
		await expect(page.locator("h1")).toContainText("Prototype and boilerplate review");
		await expect(page.locator("[data-artifact-card]")).toHaveCount(3);
		await expect(page.locator("[data-artifact-card='prototype']")).toContainText("Checkout recovery prototype");
		await expect(page.locator("[data-artifact-card='boilerplate']")).toContainText("Workflow service boilerplate");
		await expect(page.locator("[data-artifact-card='generated-e2e']")).toContainText("Generated E2E draft");

		await page.locator("[data-artifact-card='boilerplate']").click();
		await expect(page.locator("[data-artifact-preview]")).toContainText("Workflow service boilerplate");
		await expect(page.locator("[data-review-checks]")).toContainText("service boundary");
		await expect(page.locator("[data-audit-entry-feed]")).toContainText("artifact.previewed boilerplate");

		await page.locator("[data-request-changes]").click();
		await expect(page.locator("[data-decision-state]")).toContainText("Changes requested");
		await expect(page.locator("[data-audit-entry-feed]")).toContainText("prototype.changes_requested");
		await expect(page.locator("[data-change-request-note]")).toHaveValue(/trace id/);

		await page.locator("[data-approve-prototype]").click();
		await expect(page.locator("[data-decision-state]")).toContainText("Approved");
		await expect(page.locator("[data-task-materialization]")).toContainText("Queued");
		await expect(page.locator("[data-task-materialization] li")).toHaveCount(3);
		await expect(page.locator("[data-audit-entry-feed]")).toContainText("tasks.materialized queued=3");
	});

	test("keeps review controls usable on mobile without page overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/plan-prototypes");

		await expect(page.locator("[data-plan-prototypes-page]")).toBeVisible();
		await expect(page.locator("[data-artifact-list]")).toBeVisible();
		await expect(page.locator("[data-decision-panel]")).toBeVisible();
		await expect(page.locator("[data-artifact-preview]")).toBeVisible();
		const pageOverflow = await page
			.locator("[data-plan-prototypes-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(pageOverflow).toBeLessThanOrEqual(1);
	});
});
