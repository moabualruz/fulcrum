import { expect, test } from "@playwright/test";

test.describe("skill registry", () => {
	test("lists skills with name version author description source", async ({ page }) => {
		await page.goto("/skill-registry");
		await expect(page.locator("[data-skill-row='jq']")).toContainText("Slice and transform JSON");
		await expect(page.locator("[data-skill-row='jq']")).toHaveAttribute("data-skill-source", "bundled");
		await expect(page.locator("[data-skill-row='scratch']")).toHaveAttribute("data-skill-source", "local");
	});

	test("search filters by description and author", async ({ page }) => {
		await page.goto("/skill-registry");
		await page.locator("[data-skill-search]").fill("man pages");
		await expect(page.locator("[data-skill-row='tldr']")).toBeVisible();
		await expect(page.locator("[data-skill-count]")).toHaveText("1 skills");
	});

	test("source filter narrows list", async ({ page }) => {
		await page.goto("/skill-registry");
		await page.locator("[data-skill-source-filter]").selectOption("npm");
		await expect(page.locator("[data-skill-row='tldr']")).toBeVisible();
		await expect(page.locator("[data-skill-row='jq']")).toHaveCount(0);
	});
});
