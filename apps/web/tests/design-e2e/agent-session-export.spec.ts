import { expect, test } from "@playwright/test";

test.describe("agent session export", () => {
	test("JSON export produces a slugged+timestamped filename and previews session payload", async ({ page }) => {
		await page.goto("/agent-session-export");
		await page.locator("[data-export-json]").click();
		await expect(page.locator("[data-export-format]")).toHaveText("json");
		await expect(page.locator("[data-export-filename]")).toContainText("refactor-cycle-save");
		await expect(page.locator("[data-export-filename]")).toContainText(".json");
		await expect(page.locator("[data-export-preview]")).toContainText("Refactor cycle save");
	});

	test("Markdown export includes messages, tool calls, and diffs", async ({ page }) => {
		await page.goto("/agent-session-export");
		await page.locator("[data-export-markdown]").click();
		await expect(page.locator("[data-export-format]")).toHaveText("markdown");
		await expect(page.locator("[data-export-filename]")).toContainText(".md");
		await expect(page.locator("[data-export-preview]")).toContainText("# Refactor cycle save");
		await expect(page.locator("[data-export-preview]")).toContainText("Messages");
	});
});
