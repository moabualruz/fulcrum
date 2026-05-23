import { expect, test } from "./fixtures";

test.describe("docs new route interactions", () => {
	test("advances doc type wizard and exposes template picker", async ({ page }) => {
		await page.goto("/docs/new");

		const firstCard = page.locator("[data-doc-type-card]").first();
		await firstCard.waitFor({ state: "visible" });
		await firstCard.click();
		await expect(page.locator("[data-template-picker]")).toBeVisible({ timeout: 10000 });
	});

	test("populates title, kind, and labels inputs", async ({ page }) => {
		await page.goto("/docs/new");

		await page.locator("[data-doc-title]").fill("New doc draft");
		await page.locator("[data-doc-kind]").selectOption("spec");
		await page.locator("[data-doc-labels]").fill("draft, design");

		await expect(page.locator("[data-doc-title]")).toHaveValue("New doc draft");
		await expect(page.locator("[data-doc-kind]")).toHaveValue("spec");
		await expect(page.locator("[data-doc-labels]")).toHaveValue("draft, design");
	});
});
