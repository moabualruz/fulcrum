/**
 * Smoke test for the fulcrumHome Playwright fixture.
 *
 * Guarded by the same `process.argv.includes("playwright")` pattern as
 * _smoke.spec.ts so that root `bun test` does not attempt to load
 * @playwright/test (which is a dev-only dep not resolvable by Bun's runner).
 *
 * Run via: `FULCRUM_RUN_E2E=1 bun run ci` or directly:
 *   `cd src/web && bunx playwright test tests/e2e/_fixtures.spec.ts`
 *
 * If Playwright browsers are not installed, the test will be skipped at the
 * Chromium-launch step. That is acceptable; this spec validates fixture
 * mechanics (DB seeding), not browser rendering.
 */

const isPlaywrightCli = process.argv.some((arg) =>
  arg.includes("playwright"),
);

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  test("fulcrumHome.seedProject returns a truthy id", async ({
    fulcrumHome,
  }) => {
    const { id } = await fulcrumHome.seedProject("alpha");
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("fulcrumHome.seedTask returns a truthy id", async ({
    fulcrumHome,
  }) => {
    const { id: projectId } = await fulcrumHome.seedProject("beta");
    const { id } = await fulcrumHome.seedTask({
      projectId,
      title: "My task",
      status: "pending",
    });
    expect(id).toBeTruthy();
  });

  test("fulcrumHome.seedDoc returns a truthy id", async ({
    fulcrumHome,
  }) => {
    const { id } = await fulcrumHome.seedDoc({
      projectId: null,
      title: "My doc",
      body: "hello",
      kind: "note",
    });
    expect(id).toBeTruthy();
  });

  test("fulcrumHome.home is a non-empty string", async ({ fulcrumHome }) => {
    expect(typeof fulcrumHome.home).toBe("string");
    expect(fulcrumHome.home.length).toBeGreaterThan(0);
  });

  test("fulcrumHome.orgId is a non-empty string", async ({
    fulcrumHome,
  }) => {
    expect(typeof fulcrumHome.orgId).toBe("string");
    expect(fulcrumHome.orgId.length).toBeGreaterThan(0);
  });
}

export {};
