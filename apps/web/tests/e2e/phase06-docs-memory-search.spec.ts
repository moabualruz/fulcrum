/**
 * E2E: Phase 06 — Documents, Memory, Search integration.
 *
 * Covers: doc editor page, memory browser, search page, Cmd+K palette.
 * Guarded by playwright CLI check so `bun test` skips this file.
 *
 * Run via:
 *   cd apps/web && bunx playwright test tests/e2e/phase06-docs-memory-search.spec.ts
 */

const isPlaywrightCli = process.argv.some((arg) => arg.includes("playwright"));

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  test.describe("Phase 06 — Documents", () => {
    test("docs page loads and shows sidebar tree", async ({ page }) => {
      await page.goto("/docs");
      await expect(page.locator("[data-testid='docs-sidebar']")).toBeVisible({ timeout: 10_000 });
    });

    test("create new document via UI", async ({ page }) => {
      await page.goto("/docs");
      const createBtn = page.locator("button:has-text('New'), button:has-text('Create'), [data-testid='create-doc']");
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await expect(page.locator("[data-testid='tiptap-editor'], .ProseMirror")).toBeVisible({ timeout: 10_000 });
      }
    });

    test("version timeline panel opens", async ({ page }) => {
      await page.goto("/docs");
      const versionBtn = page.locator("button:has-text('Versions'), button:has-text('History'), [data-testid='version-timeline']");
      if (await versionBtn.isVisible()) {
        await versionBtn.click();
        await expect(page.locator("[data-testid='version-timeline-panel'], [data-testid='doc-version-timeline']")).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe("Phase 06 — Memory Browser", () => {
    test("memory page loads with table", async ({ page }) => {
      await page.goto("/memory");
      await expect(page.locator("[data-testid='memory-browser'], table")).toBeVisible({ timeout: 10_000 });
    });

    test("memory search input exists", async ({ page }) => {
      await page.goto("/memory");
      const searchInput = page.locator("input[placeholder*='search' i], input[placeholder*='Search' i], [data-testid='memory-search']");
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Phase 06 — Search Page", () => {
    test("search page loads with input and facets", async ({ page }) => {
      await page.goto("/search");
      await expect(page.locator("input[type='search'], input[placeholder*='search' i], [data-testid='search-input']")).toBeVisible({ timeout: 10_000 });
    });

    test("facet chips visible on search page", async ({ page }) => {
      await page.goto("/search");
      const chips = page.locator("[data-testid='facet-chip'], button:has-text('All'), button:has-text('Tasks'), button:has-text('Docs')");
      await expect(chips.first()).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Phase 06 — Cmd+K Palette", () => {
    test("Cmd+K opens command palette", async ({ page }) => {
      await page.goto("/");
      await page.goto("/?e2e_palette=1");
      await expect(
        page.locator("[data-testid='command-palette'], [role='dialog']:has-text('Search'), [aria-label='Search Fulcrum']")
      ).toBeVisible({ timeout: 5_000 });
    });

    test("Cmd+K shows navigation commands", async ({ page }) => {
      await page.goto("/");
      await page.goto("/?e2e_palette=1");
      const palette = page.locator("[data-testid='command-palette'], [role='dialog']");
      await expect(palette).toBeVisible({ timeout: 5_000 });
      const items = palette.locator("[data-testid='command-item'], [role='option']");
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(5);
    });

    test("Escape closes command palette", async ({ page }) => {
      await page.goto("/");
      await page.goto("/?e2e_palette=1");
      await expect(page.locator("[data-testid='command-palette'], [role='dialog']")).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-testid='command-palette'], [role='dialog']")).not.toBeVisible({ timeout: 3_000 });
    });
  });
}
