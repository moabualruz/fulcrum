import { expect, test } from "@playwright/test";

test.describe("editor blockquote", () => {
	test("typing > space creates a quote block", async ({ page }) => {
		await page.goto("/editor-blockquote");
		await page.locator("[data-editor-input]").fill("> stay focused");
		await page.locator("[data-editor-commit]").click();
		await expect(page.locator("[data-block-quote]").last()).toContainText("stay focused");
		await expect(page.locator("[data-last-added]")).toContainText("quote");
	});

	test("slash menu offers a quote option that inserts an empty quote", async ({ page }) => {
		await page.goto("/editor-blockquote");
		await page.locator("[data-editor-slash]").click();
		await page.locator("[data-slash-quote]").click();
		await expect(page.locator("[data-block-quote]").last()).toContainText("New quote");
	});

	test("author attribution stored on attrs renders only when supplied", async ({ page }) => {
		await page.goto("/editor-blockquote");
		await page.locator("[data-quote-author-input]").fill("Ada");
		await page.locator("[data-editor-input]").fill("> elegance over cleverness");
		await page.locator("[data-editor-commit]").click();
		await expect(page.locator("[data-quote-author]").last()).toContainText("Ada");
	});

	test("quote can host paragraph list and code children", async ({ page }) => {
		await page.goto("/editor-blockquote");
		await page.locator("[data-editor-input]").fill("> outer");
		await page.locator("[data-editor-commit]").click();
		await page.locator("[data-editor-slash]").click();
		await page.locator("[data-slash-nested]").click();
		await expect(page.locator("[data-block-lang='ts']")).toBeVisible();
	});
});
