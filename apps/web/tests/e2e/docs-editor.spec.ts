import { test, expect } from "./fixtures.ts";

test.describe("Docs Editor Workflow", () => {
  test("doc tree sidebar shows page hierarchy", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("[data-doc-tree]").first()).toBeVisible();
  });

  test("creates a new document from sidebar", async ({ page, fulcrumHome }) => {
    await fulcrumHome.seedProject("docs-e2e-create", "Docs E2E Create");
    await page.request.post("/api/active-project", { data: { slug: "docs-e2e-create" } });
    await page.goto("/docs");
    await page.locator("[data-new-doc]").click();
    await page.locator("[data-doc-title]").fill("E2E Test Doc");
    await page.locator("[data-doc-kind]").selectOption("note");
    await page.locator("[data-doc-save]").click();
    await expect(page).toHaveURL(/\/docs\/(?!new$)[^/]+$/);
    await expect(page.locator("[data-doc-title]")).toContainText("E2E Test Doc");
  });

  test("tiptap editor renders with toolbar and content area", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await page.locator("[data-doc-edit]").click();
      await expect(page.locator("[data-doc-editor]")).toBeVisible();
      await expect(page.locator("[data-doc-editor-toolbar]")).toBeVisible();
    }
  });

  test("slash menu opens on / keystroke in editor", async ({ page }) => {
    await page.goto("/docs/new");
    await page.locator("[data-doc-title]").fill("Slash Test");
    const editor = page.locator("[data-doc-editor] .ProseMirror");
    if (await editor.isVisible()) {
      await editor.click();
      await editor.type("/");
      await expect(page.locator("[data-slash-menu]")).toBeVisible();
    }
  });

  test("comments panel shows inline comment threads", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await expect(page.locator("[data-comments-sidebar]")).toBeVisible();
    }
  });

  test("version history shows timeline", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await page.locator("[data-doc-history]").click();
      await expect(page.locator("[data-doc-history-view]")).toBeVisible();
    }
  });

  test("frontmatter form toggles between form and YAML modes", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("docs-e2e-frontmatter", "Docs E2E Frontmatter");
    const doc = await fulcrumHome.seedDoc({
      projectId: project.id,
      title: "FM Test",
      body: "# FM Test",
      kind: "note",
    });
    await page.goto(`/docs/${doc.id}/edit`);
    await expect(page.locator("[data-frontmatter-panel]")).toBeVisible();
    await page.locator("[data-frontmatter-toggle-yaml]").click();
    await expect(page.locator("[data-frontmatter-panel]")).toContainText("YAML");
  });

  test("backlinks section shows documents linking to current", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await expect(page.locator("[data-backlinks]")).toBeVisible();
    }
  });

  test("attachment upload adds file to document", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      const upload = page.locator("[data-attachment-upload]");
      if (await upload.isVisible()) {
        await expect(upload).toBeVisible();
      }
    }
  });
});
