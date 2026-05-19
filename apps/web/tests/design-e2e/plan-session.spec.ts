import { expect, test } from "@playwright/test";

test.describe("AI Assist planning session", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-session");
		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
	});

	test("shows persistent live session, source links, trace summary, and traffic inspector", async ({ page }) => {
		await expect(page.locator("[data-plan-session-page]")).toBeVisible();
		await expect(page.getByRole("heading", { name: "AI Assist planning" })).toBeVisible();
		await expect(page.locator("[data-session-card='plan_sess_auth_rewrite']")).toBeVisible();
		await expect(page.locator("[data-trace-source-links] a")).toHaveCount(3);
		await expect(page.locator("[data-trace-source-links]")).toContainText("doc_auth_rewrite");
		await expect(page.locator("[data-trace-source-links]")).toContainText("plan_sess_auth_rewrite");
		await expect(page.locator("[data-trace-summary]")).toContainText("tr_19b4a7c2e6f04d91");
		await expect(page.locator("[data-traffic-stream] [data-traffic-event]")).toHaveCount(3);

		await page.locator("[data-traffic-event='evt-2']").click();
		await expect(page.locator("[data-traffic-inspector]")).toContainText("planning.sources.read");
		await expect(page.locator("[data-traffic-inspector]")).toContainText("doc_auth_rewrite");
	});

	test("submits a prompt, appends stream traffic, and survives reload", async ({ page }) => {
		await page.locator("[data-plan-prompt]").fill("Create a plan and keep the source document visible.");
		await page.getByRole("button", { name: "Submit prompt" }).click();

		await expect(page.locator("[data-traffic-count]")).toHaveText("5 events");
		await expect(page.locator("[data-traffic-inspector]")).toContainText("Prompt submitted and persisted");
		await page.reload();

		await expect(page.locator("[data-session-resumed]")).toBeVisible();
		await expect(page.locator("[data-plan-prompt]")).toHaveValue("Create a plan and keep the source document visible.");
		await expect(page.locator("[data-traffic-count]")).toHaveText("5 events");
		await expect(page.locator("[data-traffic-inspector]")).toContainText("Prompt submitted and persisted");
	});

	test("recovers inline when required IDs are missing", async ({ page }) => {
		await page.getByRole("button", { name: "Clear required IDs" }).click();
		await page.getByRole("button", { name: "Submit prompt" }).click();

		await expect(page.locator("[data-plan-session-error]")).toContainText("Planning needs source, session, and trace IDs");
		await expect(page.locator("[data-plan-session-error]")).toContainText("trace=tr_19b4a7c2e6f04d91");
		await expect(page.locator("[data-traffic-count]")).toHaveText("3 events");
	});

	test("keeps forbidden protocol acronym out of visible AI Assist chrome", async ({ page }) => {
		await expect(page.locator("[data-plan-session-page]")).not.toContainText(/\bACP\b/);
	});
});
