import { expect, test } from "./fixtures";

test.describe("docs history route interactions", () => {
	test("renders history header and version timeline for a seeded document", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("docs-history-interactions", "Docs History Interactions");
		const doc = await fulcrumHome.seedDoc({
			projectId: project.id,
			title: "History Interactions Doc",
			body: "History interactions body.",
		});

		await page.goto(`/docs/${doc.id}/history`);

		await expect(page.locator("[data-doc-history-header]")).toBeVisible();
		await expect(page.locator("[data-doc-title]")).toBeVisible();
		await expect(page.locator("[data-back-doc]")).toHaveAttribute("href", `/docs/${doc.id}`);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator("[data-doc-history-header]")).toBeVisible();
	});
});
