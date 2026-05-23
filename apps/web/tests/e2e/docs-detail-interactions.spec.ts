import { expect, test } from "./fixtures";

test.describe("docs detail route interactions", () => {
	test("renders header, sidebars, and danger-zone controls for a seeded document", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("docs-detail-interactions", "Docs Detail Interactions");
		const doc = await fulcrumHome.seedDoc({
			projectId: project.id,
			title: "Detail Interactions Doc",
			body: "Detail interactions body.",
			kind: "spec",
		});

		await page.goto(`/docs/${doc.id}`);

		await expect(page.locator("[data-doc-detail-header]")).toBeVisible();
		await expect(page.locator("[data-doc-history]")).toHaveAttribute("href", `/docs/${doc.id}/history`);
		await expect(page.locator("[data-doc-edit]")).toHaveAttribute("href", `/docs/${doc.id}/edit`);
		await expect(page.locator("[data-doc-plan]")).toHaveAttribute("href", `/planning?docId=${doc.id}`);
		await expect(page.locator("[data-back-docs]")).toHaveAttribute("href", "/docs");
		await expect(page.locator("[data-doc-attachments]")).toBeVisible();
		await expect(page.locator("[data-doc-comments]")).toBeVisible();
		await expect(page.locator("[data-create-comment-form]")).toBeVisible();
		await expect(page.locator("[data-danger-zone]")).toBeVisible();

		await page.locator("[data-danger-trigger]").click();
		await expect(page.locator("[data-danger-confirm]")).toBeVisible();
		await page.locator("[data-delete-cancel]").click();
		await expect(page.locator("[data-danger-confirm]")).toBeHidden();

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator("[data-doc-detail-header]")).toBeVisible();
		await expect(page.locator("[data-doc-history]")).toBeVisible();
		await expect(page.locator("[data-doc-edit]")).toBeVisible();
	});
});
