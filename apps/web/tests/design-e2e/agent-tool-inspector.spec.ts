import { expect, test } from "@playwright/test";

test.describe("agent tool inspector", () => {
	test("active call shows name, timestamp, status, request, response", async ({ page }) => {
		await page.goto("/agent-tool-inspector");
		await expect(page.locator("[data-tool-name]")).toHaveText("read");
		await expect(page.locator("[data-tool-ts]")).toHaveText("10:00:05");
		await expect(page.locator("[data-tool-request]")).toContainText("src/cycle.ts");
		await expect(page.locator("[data-tool-response]")).toContainText("bytes");
	});

	test("switching to error call exposes the error status and error payload", async ({ page }) => {
		await page.goto("/agent-tool-inspector");
		await page.locator("[data-tool-row='tc2']").click();
		await expect(page.locator("[data-tool-name]")).toHaveText("write");
		await expect(page.locator("[data-tool-response]")).toContainText("EACCES");
	});

	test("copy request and response and download JSON expose feedback", async ({ page }) => {
		await page.goto("/agent-tool-inspector");
		await page.locator("[data-tool-copy-request]").click();
		await expect(page.locator("[data-tool-copied]")).toContainText("tc1:request");
		await page.locator("[data-tool-copy-response]").click();
		await expect(page.locator("[data-tool-copied]")).toContainText("tc1:response");
		await page.locator("[data-tool-download]").click();
		await expect(page.locator("[data-tool-downloaded]")).toContainText("read-tc1.json");
	});
});
