import { expect, test } from "@playwright/test";

test.describe("custom fields in display", () => {
	test("display properties list every custom field with a visibility toggle", async ({ page }) => {
		await page.goto("/views-custom-fields");

		await expect(page.locator("[data-views-custom-fields-header]")).toContainText("Custom fields");
		await expect(page.locator("[data-field-visible='severity']")).toBeChecked();
		await expect(page.locator("[data-field-visible='customer']")).toBeChecked();
		await expect(page.locator("[data-field-visible='story_points']")).not.toBeChecked();
	});

	test("toggling a field adds or removes it as a column", async ({ page }) => {
		await page.goto("/views-custom-fields");

		await expect(page.locator("[data-column-header='story_points']")).toHaveCount(0);
		await page.locator("[data-field-visible='story_points']").check();
		await expect(page.locator("[data-column-header='story_points']")).toHaveCount(1);
	});

	test("custom fields render as chips on card detail", async ({ page }) => {
		await page.goto("/views-custom-fields");

		await expect(page.locator("[data-task-chip-field='FUL-101-severity']")).toContainText("Severity: S1");
		await expect(page.locator("[data-task-chip-field='FUL-101-customer']")).toContainText("Customer: Acme");
	});

	test("inline edit commits new value for text and select types only", async ({ page }) => {
		await page.goto("/views-custom-fields");

		await page.locator("[data-task-cell-button='FUL-101-customer']").click();
		await page.locator("[data-task-cell-edit-input='FUL-101-customer']").fill("Wayne Enterprises");
		await page.locator("[data-task-cell-commit='FUL-101-customer']").click();
		await expect(page.locator("[data-task-cell-button='FUL-101-customer']")).toHaveText("Wayne Enterprises");

		await page.locator("[data-field-visible='story_points']").check();
		await expect(page.locator("[data-task-cell-button='FUL-101-story_points']")).toBeDisabled();
	});

	test("column order changes when a field moves up", async ({ page }) => {
		await page.goto("/views-custom-fields");

		const headersBefore = await page.locator("[data-column-header]").allInnerTexts();
		expect(headersBefore[0]).toBe("Severity");
		await page.locator("[data-field-move-down='severity']").click();
		const headersAfter = await page.locator("[data-column-header]").allInnerTexts();
		expect(headersAfter[0]).toBe("Customer");
	});
});
