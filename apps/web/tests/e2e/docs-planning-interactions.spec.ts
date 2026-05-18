import { expect, test } from "./fixtures";

test.describe("docs planning route interactions", () => {
	test("renders planning header, doc preview, and submit form for a seeded document", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("docs-planning-interactions", "Docs Planning Interactions");
		const doc = await fulcrumHome.seedDoc({
			projectId: project.id,
			title: "Planning Interactions Doc",
			body: "Planning interactions body.",
		});

		await page.goto(`/docs/${doc.id}/planning`);

		await expect(page.locator("[data-doc-planning-page]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-header]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-form]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-submit]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-back]")).toHaveAttribute("href", `/docs/${doc.id}`);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator("[data-doc-planning-header]")).toBeVisible();
		await expect(page.locator("[data-doc-planning-submit]")).toBeVisible();
	});
});
