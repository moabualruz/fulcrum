import { expect, test } from "@playwright/test";

/**
 * Rendered design-gate coverage for the AI Assist reference route.
 *
 * This spec drives chromium over the production `/ai-assist` route and asserts
 * the rendered DOM — drawer, agent routing, paused prompt edit, run preview.
 * It replaces an earlier `bun:test` + `readFileSync` source-string spec that
 * only proved Svelte source contained substrings, never that the route
 * actually rendered an OD-shaped AI Assist surface.
 */
test.describe("ai assist reference route", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/ai-assist", { waitUntil: "load" });
	});

	test("renders the OD-backed drawer with trace-linked document planning context", async ({ page }) => {
		const surface = page.locator("[data-ai-assist-page]");
		await expect(surface).toBeVisible();
		await expect(surface).toHaveAttribute("data-ai-assist-ready", "true");

		const drawer = page.locator("[data-ai-assist-drawer]");
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("aria-label", "AI Assist drawer");
		await expect(page.locator("[data-ai-assist-agent-picker]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-agent-registry]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-transcript]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-composer]")).toBeVisible();
		await expect(page.locator("h1", { hasText: "AI Assist" })).toBeVisible();

		const meta = page.locator("[data-ai-assist-meta]");
		await expect(meta).toContainText("doc_auth_rewrite");
		await expect(meta).toContainText("ask-on-write");

		const evidence = page.locator("[data-ai-assist-public-api-evidence]");
		await expect(evidence).toContainText("create/read persisted");
		await expect(evidence).toContainText("attachment downloadable");
		await expect(evidence).toContainText("trace refs ready");
	});

	test("ships drawer agent routing with all role controls and persistence", async ({ page }) => {
		const routes = page.locator("[data-ai-assist-agent-routes]");
		await expect(routes).toContainText("Agent routing");
		await expect(routes).toContainText("Executor");
		await expect(routes).toContainText("Validator");
		await expect(routes).toContainText("Planner");

		await expect(page.locator("[data-ai-assist-agent-route='executor']")).toBeVisible();
		await expect(page.locator("[data-ai-assist-agent-route='validator']")).toBeVisible();
		await expect(page.locator("[data-ai-assist-agent-route='planner']")).toBeVisible();
		await expect(page.locator("[data-ai-assist-token-estimate]")).toContainText("tokens");

		await page.locator("[data-ai-assist-save-agents]").click();
		await expect(page.locator("[data-ai-assist-agent-saved]")).toContainText("Agent overrides saved");

		const persisted = await page.evaluate(() => localStorage.getItem("fulcrum.ai-assist.agent-routes"));
		expect(persisted).not.toBeNull();
	});

	test("ships inline paused prompt edit and re-run provenance", async ({ page }) => {
		const promptEdit = page.locator("[data-ai-assist-prompt-edit]");
		await expect(promptEdit).toBeVisible();
		await expect(page.locator("[data-ai-assist-prompt-editor]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-rerun-prompt]")).toContainText("Re-run from this prompt");
		await expect(page.locator("[data-ai-assist-cancel-edit]")).toBeVisible();

		await expect(page.locator("[data-ai-assist-edit-trace]")).toContainText("run_attempt_8f29a4c1b3e0d5f7");
	});

	test("ships inline run preview before dispatch", async ({ page }) => {
		const preview = page.locator("[data-ai-assist-run-preview]");
		await expect(preview).toBeVisible();
		await expect(preview).toContainText("Preview before dispatch");

		await expect(page.locator("[data-ai-assist-preview-prompt]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-preview-scope]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-preview-tools]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-preview-gates]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-preview-cost]")).toContainText("Agent cost estimate");
		await expect(page.locator("[data-ai-assist-confirm-dispatch]")).toBeVisible();
	});

	test("keeps the drawer usable on mobile without page-level overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/ai-assist", { waitUntil: "load" });

		const overflow = await page
			.locator("[data-ai-assist-page]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await expect(page.locator("[data-ai-assist-drawer]")).toBeVisible();
	});

	test("keeps forbidden protocol and picker wording out of visible AI Assist chrome", async ({ page }) => {
		const visibleText = (await page.locator("[data-ai-assist-page]").innerText()).toLowerCase();
		expect(visibleText).not.toMatch(/\bacp\b/);
		expect(visibleText).not.toMatch(/\bchat\b/);
		expect(visibleText).not.toMatch(/model picker/);
	});
});
