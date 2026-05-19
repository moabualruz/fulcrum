import { expect, test } from "@playwright/test";

test.describe("settings overview", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator("[data-settings-ready='true']")).toBeVisible();
	});

	test("shows live runtime URLs and navigable settings destinations", async ({ page }) => {
		await expect(page.locator("[data-settings-origin]")).toContainText("http://127.0.0.1");
		await expect(page.locator("[data-settings-api-url]")).toContainText("/api/v1");
		await expect(page.locator("[data-settings-openapi]")).toHaveAttribute("href", "/api/v1/openapi.json");

		const hrefs = await page.locator("[data-settings-link]").evaluateAll((links) =>
			links.map((link) => link.getAttribute("href")),
		);
		expect(hrefs).toEqual([
			"/settings/theme",
			"/settings/routing",
			"/settings/connectors",
			"/settings/api",
			"/settings/flags",
			"/settings/secrets",
		]);

		for (const href of hrefs) {
			const response = await page.request.get(href ?? "");
			expect(response.status(), href ?? "").toBeLessThan(500);
		}
	});

	test("persists safe settings edits across reload", async ({ page }) => {
		await page.locator("[data-settings-api-input]").fill("/api/v1");
		await page.locator("[data-settings-connector-url]").fill("https://github.com/acme/repo");
		await page.locator("[data-settings-token-input]").fill("good-token");
		await page.locator("[data-settings-routing-select]").selectOption("claude");
		await page.locator("[data-settings-feature-toggle]").uncheck();
		await page.locator("[data-settings-theme-select]").selectOption("dark");
		await page.locator("[data-settings-save]").click();
		await expect(page.locator("[data-settings-saved]")).toContainText("Saved state:");

		await page.reload();
		await expect(page.locator("[data-settings-routing-select]")).toHaveValue("claude");
		await expect(page.locator("[data-settings-feature-toggle]")).not.toBeChecked();
		await expect(page.locator("[data-settings-theme-select]")).toHaveValue("dark");
		await expect(page.locator("[data-settings-connector-url]")).toHaveValue("https://github.com/acme/repo");
	});

	test("shows route-specific recovery guidance for bad URL and token", async ({ page }) => {
		await page.locator("[data-settings-api-input]").fill("http://localhost:3000");
		await page.locator("[data-settings-connector-url]").fill("http://github.local");
		await page.locator("[data-settings-token-input]").fill("bad-token");
		await page.locator("[data-settings-save]").click();

		await expect(page.locator("[data-settings-error='/settings/api']")).toContainText("API base URL must stay under /api/.");
		await expect(page.locator("[data-settings-error='/settings/api']")).toContainText("OpenAPI route");
		await expect(page.locator("[data-settings-error='/settings/connectors']")).toContainText("Connector host must use https.");
		await expect(page.locator("[data-settings-error='/settings/connectors']")).toContainText("Connector token failed validation.");
		await expect(page.locator("[data-settings-error='/settings/connectors']")).toContainText("Rotate the token");
	});
});
