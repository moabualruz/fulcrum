import { expect, test } from "@playwright/test";

test.describe("ai assist reference route", () => {
	test("renders OD-backed drawer with trace-linked document planning context", async ({ page }) => {
		await page.goto("/ai-assist");

		await expect(page.locator("[data-ai-assist-ready='true']")).toBeVisible();
		await expect(page.getByRole("heading", { name: "AI Assist", exact: true }).first()).toBeVisible();
		await expect(page.locator("[data-ai-assist-drawer]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-agent-picker]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-meta]")).toContainText("doc_auth_rewrite");
		await expect(page.locator("[data-ai-assist-meta]")).toContainText("ask-on-write");
		await expect(page.locator("[data-ai-assist-sources] article")).toHaveCount(3);
		await expect(page.locator("[data-ai-assist-public-api-evidence]")).toContainText("create/read persisted");
		await expect(page.locator("[data-ai-assist-public-api-evidence]")).toContainText("attachment downloadable");
		await expect(page.locator("[data-ai-assist-public-api-evidence]")).toContainText("trace refs ready");
		await expect(page.locator("[data-ai-assist-suggestions] button")).toHaveCount(4);
		await expect(page.locator("[data-ai-assist-agent-registry]")).toContainText("codex");
		await expect(page.locator("[data-ai-assist-transcript] article")).toHaveCount(3);
		await expect(page.locator("[data-ai-assist-composer] textarea")).toContainText("@scope");
	});

	test("keeps the drawer usable on mobile without page-level overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/ai-assist");

		await expect(page.locator("[data-ai-assist-drawer]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-composer]")).toBeVisible();
		const overflow = await page.locator("[data-ai-assist-page]").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test("keeps forbidden protocol acronym out of visible AI Assist chrome", async ({ page }) => {
		await page.goto("/ai-assist");

		await expect(page.locator("[data-ai-assist-page]")).not.toContainText(/\bACP\b/);
		await expect(page.locator("[data-ai-assist-page]")).not.toContainText(/chat/i);
	});
});
