import { expect, test } from "./fixtures";

test.describe("docs edit route interactions", () => {
	test("renders edit header, frontmatter, title, kind, labels, body, save, and cancel for a seeded document", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("docs-edit-interactions", "Docs Edit Interactions");
		const doc = await fulcrumHome.seedDoc({
			projectId: project.id,
			title: "Edit Interactions Doc",
			body: "Edit interactions body.",
			kind: "spec",
		});

		await page.goto(`/docs/${doc.id}/edit`);

		await expect(page.locator("[data-doc-edit-header]")).toBeVisible();
		await expect(page.locator("[data-back-doc]")).toHaveAttribute("href", `/docs/${doc.id}`);
		await expect(page.locator("[data-doc-history]")).toHaveAttribute("href", `/docs/${doc.id}/history`);
		await expect(page.locator("[data-doc-edit-form]")).toBeVisible();
		await expect(page.locator("[data-frontmatter-panel]")).toBeVisible();
		await expect(page.locator("[data-doc-title]")).toBeVisible();
		await expect(page.locator("[data-doc-kind]")).toBeVisible();
		await expect(page.locator("[data-doc-labels]")).toBeVisible();
		await expect(page.locator("[data-doc-save]")).toBeVisible();
		await expect(page.locator("[data-doc-cancel]")).toHaveAttribute("href", `/docs/${doc.id}`);
		await expect(page.locator("[data-comments-sidebar]")).toBeVisible();

		await page.locator("[data-doc-title]").fill("Edit Interactions Doc (renamed)");
		await page.locator("[data-doc-labels]").fill("edit, design");
		await page.locator("[data-frontmatter-toggle-yaml]").click();
		await page.locator("[data-frontmatter-toggle-yaml]").click();

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator("[data-doc-edit-header]")).toBeVisible();
		await expect(page.locator("[data-doc-save]")).toBeVisible();
		await expect(page.locator("[data-doc-cancel]")).toBeVisible();
	});
});
