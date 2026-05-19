import { expect, test } from "@playwright/test";

test.describe("document labels", () => {
	test("add label appends to the list with chosen scope and records audit entry", async ({ page }) => {
		await page.goto("/doc-labels");
		await page.locator("[data-doc-labels-new-name]").fill("postmortem");
		await page.locator("[data-doc-labels-new-scope]").selectOption("project");
		await page.locator("[data-doc-labels-add]").click();
		await expect(page.locator("[data-label-row='l4']")).toHaveAttribute("data-label-scope", "project");
		await expect(page.locator("[data-doc-labels-audit]")).toContainText("label-create:l4");
	});

	test("filter narrows docs and saved view persists the filter name", async ({ page }) => {
		await page.goto("/doc-labels");
		await page.locator("[data-doc-labels-filter]").selectOption("l1");
		await expect(page.locator("[data-doc-row='d1']")).toBeVisible();
		await expect(page.locator("[data-doc-row='d3']")).toHaveCount(0);
		await page.locator("[data-doc-labels-view-name]").fill("Only L1");
		await page.locator("[data-doc-labels-save-view]").click();
		await expect(page.locator("[data-saved-view='Only L1']")).toBeVisible();
	});

	test("permission off disables editing controls", async ({ page }) => {
		await page.goto("/doc-labels");
		await page.locator("[data-doc-labels-permission]").uncheck();
		await expect(page.locator("[data-doc-labels-add]")).toBeDisabled();
		await expect(page.locator("[data-doc-label-toggle='d1:l1']")).toBeDisabled();
	});

	test("toggling a label on a doc records audit and reflects state", async ({ page }) => {
		await page.goto("/doc-labels");
		await page.locator("[data-doc-label-toggle='d1:l2']").click();
		await expect(page.locator("[data-doc-label-toggle='d1:l2']")).toHaveAttribute("data-doc-label-on", "true");
		await expect(page.locator("[data-doc-labels-audit]")).toContainText("doc-label-toggle:d1:l2");
	});
});
