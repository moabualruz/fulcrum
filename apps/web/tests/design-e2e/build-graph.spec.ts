import { expect, test } from "@playwright/test";

test.describe("build graph doc search", () => {
	test("renders scoped doc search results with snippets, filters, and graph actions", async ({ page }) => {
		await page.goto("/build-graph");

		await expect(page.locator("[data-build-graph-search]")).toBeVisible();
		await expect(page.locator("[data-doc-search-input]")).toHaveValue("kernel");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Project");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Task");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Run");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Document type");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Owner");
		await expect(page.locator("[data-doc-search-filters]")).toContainText("Attachments");

		const firstResult = page.locator("[data-doc-result]").first();
		await expect(firstResult.locator("[data-doc-snippet]")).toContainText("Planning context");
		await expect(firstResult.locator("[data-doc-type]")).toContainText("decision");
		await expect(firstResult.locator("[data-doc-scope]")).toContainText("Project docs");
		await expect(firstResult.locator("[data-updated-at]")).toContainText("2026-05-18");
		await expect(firstResult.locator("[data-graph-counts]")).toContainText("backlinks");

		await firstResult.locator("[data-action-context]").click();
		await expect(page.locator("[data-selected-context]")).toContainText("doc-kernel-notes");
		await firstResult.locator("[data-action-copy]").click();
		await expect(page.locator("[data-copied-link]")).toContainText("/docs/doc-kernel-notes");
		await firstResult.locator("[data-action-reveal]").click();
		await expect(page.locator("[data-tree-reveal]")).toContainText("doc-kernel-notes");
	});

	test("filters by owner and attachment state without leaking unrelated rows", async ({ page }) => {
		await page.goto("/build-graph");

		await page.locator("[data-filter-owner]").selectOption("ada");
		await expect(page.locator("[data-result-count]")).toContainText("1 visible");
		await expect(page.locator("[data-doc-results], [data-doc-search-results]")).toContainText("Filter map");
		await expect(page.locator("[data-doc-search-results]")).not.toContainText("Kernel search notes");

		await page.locator("[data-filter-attachments]").selectOption("with attachments");
		await expect(page.locator("[data-result-count]")).toContainText("0 visible");
	});
});
