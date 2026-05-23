import { expect, test } from "@playwright/test";

test.describe("retry with prompt diff", () => {
	test("failed run exposes retry, opens editor, and confirmation creates a new run linked to source", async ({ page }) => {
		await page.goto("/run-retry-prompt");
		await page.locator("[data-retry-open]").click();
		await expect(page.locator("[data-retry-editor]")).toBeVisible();
		await page.locator("[data-retry-new]").fill("Refactor cycle save to use Zod. Validate inputs and add domain test.");
		await page.locator("[data-retry-confirm]").click();
		await expect(page.locator("[data-retry-run='r2']")).toHaveAttribute("data-retry-run-parent", "r1");
		await expect(page.locator("[data-retry-run='r2']")).toHaveAttribute("data-retry-run-status", "running");
		await expect(page.locator("[data-retry-diff-to]")).toContainText("domain test");
	});

	test("both runs remain in the feed after retry", async ({ page }) => {
		await page.goto("/run-retry-prompt");
		await page.locator("[data-retry-open]").click();
		await page.locator("[data-retry-confirm]").click();
		await expect(page.locator("[data-retry-run='r1']")).toBeVisible();
		await expect(page.locator("[data-retry-run='r2']")).toBeVisible();
	});
});
