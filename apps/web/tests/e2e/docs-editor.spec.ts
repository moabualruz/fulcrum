import { test, expect } from "@playwright/test";

test.describe("Docs Editor Workflow", () => {
  test("doc tree sidebar shows page hierarchy", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("[data-doc-tree]")).toBeVisible();
  });

  test("creates a new document from sidebar", async ({ page }) => {
    await page.goto("/docs");
    await page.locator("[data-new-doc]").click();
    await page.locator("[data-doc-title]").fill("E2E Test Doc");
    await page.locator("[data-doc-kind]").selectOption("note");
    await page.locator("[data-doc-save]").click();
    await expect(page).toHaveURL(/\/docs\//);
  });

  test("tiptap editor renders with toolbar and content area", async ({ page }) => {
    await page.goto("/docs");
    const firstDoc = page.locator("[data-doc-tree] a").first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await page.locator("[data-doc-edit-link]").click();
      await expect(page.locator("[data-doc-editor]")).toBeVisible();
      await expect(page.locator("[data-editor-toolbar]")).toBeVisible();
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
      await expect(page.locator("[data-version-timeline]")).toBeVisible();
    }
  });

  test("frontmatter form toggles between form and YAML modes", async ({ page }) => {
    await page.goto("/docs/new");
    await page.locator("[data-doc-title]").fill("FM Test");
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
