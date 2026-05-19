import { expect, test } from "@playwright/test";

test.describe("review templates", () => {
	test("rendering a template substitutes fields and submission stores the structured payload", async ({ page }) => {
		await page.goto("/review-templates");

		await page.locator("[data-template-select]").selectOption("tpl_missing_criteria");
		await page.locator("[data-template-field='section']").fill("3.2");
		await page.locator("[data-template-field='gap']").fill("rollback signal");
		await page.locator("[data-template-render]").click();
		await expect(page.locator("[data-template-body]")).toHaveValue(/3\.2 omits acceptance criteria for rollback signal/);

		await page.locator("[data-template-submit]").click();
		await expect(page.locator("[data-template-submitted-kind]")).toHaveText("missing-criteria");
		await expect(page.locator("[data-template-submitted-body]")).toContainText("3.2");
	});

	test("body remains editable before submit and submitted payload uses the edited copy", async ({ page }) => {
		await page.goto("/review-templates");
		await page.locator("[data-template-select]").selectOption("tpl_prototype_mismatch");
		await page.locator("[data-template-render]").click();
		await page.locator("[data-template-body]").fill("Custom edited content before submit.");
		await page.locator("[data-template-submit]").click();
		await expect(page.locator("[data-template-submitted-body]")).toHaveText("Custom edited content before submit.");
	});

	test("scope filter narrows the template selector", async ({ page }) => {
		await page.goto("/review-templates");
		await page.locator("[data-template-scope-filter]").selectOption("code-review");
		const options = await page.locator("[data-template-select] option").allTextContents();
		expect(options).toContain("Test gap");
		expect(options).toContain("Code risk");
		expect(options).not.toContain("Stale context");
	});

	test("custom template can be added with a chosen scope", async ({ page }) => {
		await page.goto("/review-templates");
		await page.locator("[data-template-new-label]").fill("Spec drift");
		await page.locator("[data-template-new-scope]").selectOption("planning");
		await page.locator("[data-template-new-body]").fill("Spec drifted from implementation");
		await page.locator("[data-template-new-add]").click();
		await page.locator("[data-template-scope-filter]").selectOption("planning");
		const options = await page.locator("[data-template-select] option").allTextContents();
		expect(options).toContain("Spec drift");
	});
});
