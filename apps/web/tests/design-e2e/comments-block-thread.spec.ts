import { expect, test } from "@playwright/test";

test.describe("block threads", () => {
	test("hovering a block reveals comment trigger and opens thread panel", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b2']").hover();
		await page.locator("[data-block-thread-toggle='b2']").click();
		await expect(page.locator("[data-thread-panel]")).toHaveAttribute("data-thread-for", "b2");
	});

	test("start thread on a block then reply adds a comment", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b2']").hover();
		await page.locator("[data-block-thread-toggle='b2']").click();
		await page.locator("[data-thread-start]").click();
		await page.locator("[data-thread-reply-input]").fill("first reply");
		await page.locator("[data-thread-reply]").click();
		await expect(page.locator("[data-thread-comment='c1']")).toContainText("first reply");
	});

	test("resolving a thread hides the reply controls", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b1']").hover();
		await page.locator("[data-block-thread-toggle='b1']").click();
		await page.locator("[data-thread-resolve]").click();
		await expect(page.locator("[data-thread-resolved]")).toBeVisible();
		await expect(page.locator("[data-thread-reply]")).toHaveCount(0);
	});

	test("close button dismisses the panel", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b1']").hover();
		await page.locator("[data-block-thread-toggle='b1']").click();
		await page.locator("[data-thread-close]").click();
		await expect(page.locator("[data-thread-panel]")).toHaveCount(0);
	});
});
