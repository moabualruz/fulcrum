import { expect, test } from "@playwright/test";

test.describe("block threads", () => {
	test("hovering a block reveals comment trigger and opens thread panel", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b2']").hover();
		await page.locator("[data-block-thread-toggle='b2']").click();
		await expect(page.locator("[data-thread-panel]")).toHaveAttribute("data-thread-for", "b2");
	});

	test("shows inline comment mark and side margin pin with hover preview", async ({ page }) => {
		await page.goto("/comments-block-thread");

		await expect(page.locator("[data-inline-comment-mark='b1']")).toContainText("architecture decision");
		await expect(page.locator("[data-comment-count-badge='b1']")).toHaveText("1");
		await expect(page.locator("[data-margin-pin='b1']")).toBeVisible();
		await page.locator("[data-margin-pin='b1']").hover();
		await expect(page.locator("[data-margin-pin-preview='b1']")).toContainText("Need consensus");

		await page.locator("[data-inline-comment-mark='b1']").click();
		await expect(page.locator("[data-thread-panel]")).toHaveAttribute("data-thread-for", "b1");
		await expect(page.locator("[data-thread-selection]")).toContainText("architecture decision");
	});

	test("start thread on a block then reply adds a comment", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b2']").hover();
		await page.locator("[data-block-thread-toggle='b2']").click();
		await page.locator("[data-thread-start]").click();
		await page.locator("[data-thread-reply-input]").fill("first reply");
		await page.locator("[data-thread-reply]").click();
		await expect(page.locator("[data-thread-comment='c1']")).toContainText("first reply");
		await expect(page.locator("[data-inline-comment-mark='b2']")).toContainText("source text");
	});

	test("multiple comments on the same selection update the inline count badge", async ({ page }) => {
		await page.goto("/comments-block-thread");

		await page.locator("[data-inline-comment-mark='b1']").click();
		await page.locator("[data-thread-reply-input]").fill("second reply");
		await page.locator("[data-thread-reply]").click();
		await expect(page.locator("[data-comment-count-badge='b1']")).toHaveText("+2");
		await expect(page.locator("[data-block-thread-toggle='b1']")).toHaveText("Thread (2)");
	});

	test("resolving a thread hides the reply controls", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b1']").hover();
		await page.locator("[data-block-thread-toggle='b1']").click();
		await page.locator("[data-thread-resolve]").click();
		await expect(page.locator("[data-thread-resolved]")).toBeVisible();
		await expect(page.locator("[data-thread-reply]")).toHaveCount(0);
		await expect(page.locator("[data-inline-comment-mark='b1']")).toHaveAttribute("data-resolved-marker", "true");
	});

	test("delete comment mark removes inline and margin markers", async ({ page }) => {
		await page.goto("/comments-block-thread");

		await page.locator("[data-inline-comment-mark='b1']").click();
		await page.locator("[data-delete-mark='b1']").click();
		await expect(page.locator("[data-inline-comment-mark='b1']")).toHaveCount(0);
		await expect(page.locator("[data-margin-pin='b1']")).toHaveCount(0);
		await expect(page.locator("[data-thread-panel]")).toHaveCount(0);
	});

	test("close button dismisses the panel", async ({ page }) => {
		await page.goto("/comments-block-thread");
		await page.locator("[data-block-id='b1']").hover();
		await page.locator("[data-block-thread-toggle='b1']").click();
		await page.locator("[data-thread-close]").click();
		await expect(page.locator("[data-thread-panel]")).toHaveCount(0);
	});
});
