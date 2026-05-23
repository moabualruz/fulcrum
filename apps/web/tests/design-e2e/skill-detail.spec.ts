import { expect, test } from "@playwright/test";

test.describe("skill detail", () => {
	test("header shows name author and latest version", async ({ page }) => {
		await page.goto("/skill-detail");
		await expect(page.locator("[data-skill-name]")).toHaveText("jq");
		await expect(page.locator("[data-skill-author]")).toHaveText("stedolan");
		await expect(page.locator("[data-skill-latest]")).toHaveText("1.7.1");
	});

	test("switching versions updates release date and notes", async ({ page }) => {
		await page.goto("/skill-detail");
		await page.locator("[data-skill-version-select]").selectOption("1.6.0");
		await expect(page.locator("[data-skill-version-released]")).toHaveText("2023-04-12");
		await expect(page.locator("[data-skill-version-notes]")).toContainText("Initial stable");
	});

	test("install button records the chosen version", async ({ page }) => {
		await page.goto("/skill-detail");
		await page.locator("[data-skill-version-select]").selectOption("1.7.0");
		await page.locator("[data-skill-install]").click();
		await expect(page.locator("[data-skill-installed]")).toContainText("v1.7.0");
	});
});
