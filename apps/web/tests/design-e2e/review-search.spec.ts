import { expect, test } from "@playwright/test";

test.describe("review search", () => {
	test("query filters across annotation text and file paths", async ({ page }) => {
		await page.goto("/review-search");

		await expect(page.locator("[data-review-result-count]")).toHaveText("6");

		await page.locator("[data-review-query]").fill("auth.ts");
		await expect(page.locator("[data-review-row='r4']")).toBeVisible();
		await expect(page.locator("[data-review-result-count]")).toHaveText("1");

		await page.locator("[data-review-query]").fill("timezone");
		await expect(page.locator("[data-review-row='r6']")).toBeVisible();
	});

	test("kind, status, and author filters narrow results", async ({ page }) => {
		await page.goto("/review-search");

		await page.locator("[data-review-filter-kind]").selectOption("annotation");
		await expect(page.locator("[data-review-row='r1']")).toBeVisible();
		await expect(page.locator("[data-review-row='r6']")).toBeVisible();

		await page.locator("[data-review-filter-status]").selectOption("blocker");
		await expect(page.locator("[data-review-row='r1']")).toBeVisible();
		await expect(page.locator("[data-review-row='r6']")).toHaveCount(0);

		await page.locator("[data-review-filter-status]").selectOption("any");
		await page.locator("[data-review-filter-author]").fill("alice");
		await expect(page.locator("[data-review-row='r1']")).toBeVisible();
		await expect(page.locator("[data-review-row='r6']")).toBeVisible();
	});

	test("jump exposes the selected item and source switch survives query", async ({ page }) => {
		await page.goto("/review-search");

		await page.locator("[data-review-query]").fill("Migration");
		await expect(page.locator("[data-review-row='r1']")).toBeVisible();

		await page.locator("[data-review-switch-source]").click();
		await expect(page.locator("[data-review-switch-source]")).toContainText("split");
		await expect(page.locator("[data-review-query]")).toHaveValue("Migration");
		await expect(page.locator("[data-review-row='r1']")).toBeVisible();

		await page.locator("[data-review-jump='r1']").click();
		await expect(page.locator("[data-review-jumped]")).toContainText("Jumped to r1");
	});

	test("empty state surfaces when no rows match", async ({ page }) => {
		await page.goto("/review-search");
		await page.locator("[data-review-query]").fill("zzznomatchzzz");
		await expect(page.locator("[data-review-empty]")).toBeVisible();
		await expect(page.locator("[data-review-result-count]")).toHaveText("0");
	});
});
