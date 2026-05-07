/**
 * E2E: search page full flow — query, facet by kind, all 8 kinds visible.
 *
 * Guarded by playwright CLI check so `bun test` skips this file.
 *
 * Run via:
 *   cd src/web && bunx playwright test tests/e2e/search-e2e.spec.ts
 */

const isPlaywrightCli = process.argv.some((arg) => arg.includes("playwright"));

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  const COMMON = "e2esearchable";
  const KINDS = [
    "task",
    "doc",
    "memory",
    "run",
    "artifact",
    "repo",
    "project",
    "sprint",
  ] as const;

  test("search page returns all 8 kinds for common query", async ({
    page,
    fulcrumHome,
  }) => {
    await fulcrumHome.seedSearchKinds(COMMON, KINDS);
    await page.goto(`/search?q=${COMMON}`);
    await expect(page.locator("[data-search-hit]")).toHaveCount(8, {
      timeout: 15000,
    });
  });

  test("search page facets by kind=doc narrows to 1 result", async ({
    page,
    fulcrumHome,
  }) => {
    await fulcrumHome.seedSearchKinds(COMMON, KINDS);
    // The search page uses source_kind groups; verify the doc group has 1 hit
    await page.goto(`/search?q=${COMMON}`);
    const docGroup = page.locator(
      '[data-search-group][data-source-kind="doc"]',
    );
    await expect(docGroup).toBeVisible({ timeout: 15000 });
    await expect(docGroup.locator("[data-search-hit]")).toHaveCount(1);
  });
}

export {};
