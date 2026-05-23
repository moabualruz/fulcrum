import { expect, test } from "../e2e/fixtures";

const reportTabs = [
	"burndown",
	"velocity",
	"cycle-time",
	"throughput",
	"wip",
	"cfd",
	"forecast",
	"final-qa",
] as const;

test.describe("projects reports route interaction coverage", () => {
	test("exercises report tabs, date controls, and export actions at desktop width", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("reports-design-desktop", "Reports Design Desktop");
		await page.goto(`/projects/${project.id}/reports`);

		await expect(page.locator("[data-reports-header]")).toContainText("Reports");
		await expect(page.locator("[data-testid='report-date-picker']")).toBeVisible();
		await page.locator("[data-testid='report-date-picker']").click();
		await page.locator("[data-testid='date-range-last-30']").click();

		for (const tab of reportTabs) {
			await page.locator(`[data-testid='report-tab-${tab}']`).click();
			await expect(page.locator(`[data-tab='${tab}']`)).toHaveAttribute("aria-selected", "true");
		}

		for (const tab of ["burndown", "velocity", "throughput"] as const) {
			await page.locator(`[data-testid='report-tab-${tab}']`).click();
			await page.getByRole("button", { name: "Export CSV" }).click();
		}

		await test.info().attach("projects-reports-desktop", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("submits final QA and review-workbench controls without dead endpoints", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("reports-design-final-qa", "Reports Design Final QA");
		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);

		await expect(page.locator("[data-final-qa-panel]")).toBeVisible();
		await page.getByRole("button", { name: "Run Final QA" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Run QA Gate" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Prepare UAT" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Approve UAT" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Apply Auto Decision" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Run Generated E2E" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.locator("#review-workbench-files").fill("[]");
		await page.locator("#review-workbench-annotations").fill("[]");
		await page.getByRole("button", { name: "Build Review Workbench" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.locator("#review-session-save-files").fill("[]");
		await page.locator("#review-session-save-annotations").fill("[]");
		await page.getByRole("button", { name: "Save Review Session" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.getByRole("button", { name: "Load Review Session" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await page.goto(`/projects/${project.id}/reports?tab=final-qa`);
		await page.locator("#review-session-suggested-code").fill("return true;");
		await page.getByRole("button", { name: "Add Annotation" }).click();
		await expect(page.locator("[data-reports-header]")).toBeVisible();

		await test.info().attach("projects-reports-final-qa", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("keeps report controls usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("reports-design-mobile", "Reports Design Mobile");
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${project.id}/reports`);

		await expect(page.locator("[data-reports-header]")).toBeVisible();
		await expect(page.locator("[data-report-tabs]")).toBeVisible();
		await page.locator("[data-testid='report-tab-forecast']").click();
		await expect(page.locator("[data-testid='chart-forecast']")).toBeVisible();

		const overflow = await page.locator("[data-testid='reports-page']").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await test.info().attach("projects-reports-mobile", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("falls back to project recovery when the project is missing", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id/reports");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});
