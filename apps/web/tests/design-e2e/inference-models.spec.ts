import { expect, test } from "@playwright/test";

test.describe("inference models", () => {
	test("table renders required columns and statuses", async ({ page }) => {
		await page.goto("/inference-models");
		await expect(page.locator("[data-model-row='claude-opus-4-7']")).toHaveAttribute("data-model-status", "available");
		await expect(page.locator("[data-model-row='gpt-4o']")).toHaveAttribute("data-model-status", "downloaded");
	});

	test("pull transitions status to pulling then downloaded", async ({ page }) => {
		await page.goto("/inference-models");
		await page.locator("[data-model-pull='claude-opus-4-7']").click();
		await expect(page.locator("[data-model-row='claude-opus-4-7']")).toHaveAttribute("data-model-status", "downloaded");
		await expect(page.locator("[data-model-last-pulled]")).toContainText("claude-opus-4-7");
		await expect(page.locator("[data-model-pull='claude-opus-4-7']")).toHaveCount(0);
	});
});
