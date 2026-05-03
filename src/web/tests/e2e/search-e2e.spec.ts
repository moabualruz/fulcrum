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
  const { indexSearchDocument } = await import(
    "../../../product-kernel/search.ts"
  );
  const { openPglite } = await import("../../../product-kernel/db/pglite.ts");
  const { runMigrations } = await import(
    "../../../product-kernel/db/migrate.ts"
  );
  const { createLocalOrg } = await import(
    "../../../product-kernel/store/repositories.ts"
  );
  const { join } = await import("node:path");

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

  async function seedAllKinds(home: string): Promise<void> {
    const dbPath = join(home, "state", "product", "db", "main");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, {
        slug: "default",
        name: "Default",
      });
      for (const kind of KINDS) {
        await indexSearchDocument(db, {
          orgId: org.id,
          sourceKind: kind,
          sourceId: `${kind}-e2e-1`,
          title: `${COMMON} ${kind} title`,
          body: `${COMMON} ${kind} body`,
        });
      }
    } finally {
      await db.close();
    }
  }

  test("search page returns all 8 kinds for common query", async ({
    page,
    fulcrumHome,
  }) => {
    await seedAllKinds(fulcrumHome.home);
    await page.goto(`/search?q=${COMMON}`);
    await expect(page.locator("[data-search-hit]")).toHaveCount(8, {
      timeout: 15000,
    });
  });

  test("search page facets by kind=doc narrows to 1 result", async ({
    page,
    fulcrumHome,
  }) => {
    await seedAllKinds(fulcrumHome.home);
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
