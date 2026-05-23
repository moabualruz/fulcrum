import { expect, test } from "@playwright/test";

test.describe("streamed message", () => {
	test("starting stream shows streaming indicator and final text stabilizes", async ({ page }) => {
		await page.goto("/streamed-message");
		await page.locator("[data-stream-start]").click();
		await expect(page.locator("[data-stream-transcript]")).toHaveAttribute("data-stream-streaming", "true");
		await expect(page.locator("[data-stream-transcript]")).toHaveAttribute("data-stream-streaming", "false");
		await expect(page.locator("[data-stream-text]")).toContainText("cycle.ts");
		await expect(page.locator("[data-stream-indicator]")).toHaveCount(0);
	});

	test("copy works on streamed text and reports character count", async ({ page }) => {
		await page.goto("/streamed-message");
		await page.locator("[data-stream-start]").click();
		await expect(page.locator("[data-stream-transcript]")).toHaveAttribute("data-stream-streaming", "false");
		await page.locator("[data-stream-copy]").click();
		await expect(page.locator("[data-stream-copied]")).toContainText("characters");
	});
});
