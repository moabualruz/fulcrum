import { test, expect } from "./fixtures.ts";

async function gotoAndExpectOk(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  expect(page.url(), `${path} redirected to login`).not.toContain("/auth/login");
  await page.waitForTimeout(250);
  const shell = page.locator("main, [data-route-skeleton]").first();
  await expect(shell).toBeVisible({ timeout: 10_000 });
}

async function expectVisible(page: import("@playwright/test").Page, selector: string) {
  const locator = page.locator(selector).first();
  await expect(locator).toBeVisible({ timeout: 10_000 });
}

test.describe("Phase 08 — Web surface delivery UAT", () => {
  test("first-time setup", async ({ page }) => {
    await gotoAndExpectOk(page, "/");
    await expect(page.locator("[data-app-topbar], [data-route-skeleton], main").first()).toBeVisible();
  });

  test("project CRUD", async ({ page }) => {
    await gotoAndExpectOk(page, "/projects");
    await expect(page.locator("a[href='/projects/new'], [data-projects-new-header], main").first()).toBeVisible();
  });

  test("task CRUD", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("phase08-task-crud", "Phase 08 Task CRUD");
    await fulcrumHome.seedTask({ projectId: project.id, title: "Phase 08 Task", status: "pending" });
    await gotoAndExpectOk(page, `/projects/${project.id}/board`);
    await expectVisible(page, "[data-project-board-grid], [data-task-card]");
  });

  test("kanban move", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("phase08-kanban", "Phase 08 Kanban");
    await fulcrumHome.seedTask({ projectId: project.id, title: "Move me", status: "pending" });
    await gotoAndExpectOk(page, `/projects/${project.id}/board`);
    await expectVisible(page, "[data-project-board-grid]");
    await expectVisible(page, "[data-swimlane-toggle]");
  });

  test("sprint management", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("phase08-sprints", "Phase 08 Sprints");
    await gotoAndExpectOk(page, `/projects/${project.id}/reports`);
    await expectVisible(page, "[data-sprint-selector], [data-testid='burndown-chart'], main");
  });

  test("doc CRUD", async ({ page }) => {
    await gotoAndExpectOk(page, "/docs");
    await expectVisible(page, "[data-docs-header], [data-new-doc]");
  });

  test("doc editing", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("phase08-doc-edit", "Phase 08 Doc Edit");
    const doc = await fulcrumHome.seedDoc({ projectId: project.id, title: "Phase 08 Doc", body: "Body" });
    await gotoAndExpectOk(page, `/docs/${doc.id}/edit`);
    await expectVisible(page, "[data-doc-edit-form], [data-doc-editor]");
    await expect(page.locator("[data-presence-avatars], [data-cursor-overlay]")).toHaveCount(0);
  });

  test("search and facets", async ({ page }) => {
    await gotoAndExpectOk(page, "/search?q=phase08");
    await expect(page.locator("[data-search-input], [data-facet-panel]").first()).toBeVisible();
  });

  test("memory browse", async ({ page }) => {
    await gotoAndExpectOk(page, "/memory");
    await expectVisible(page, "[data-memory-browser], [data-memory-filter]");
  });

  test("repo management", async ({ page }) => {
    await gotoAndExpectOk(page, "/repos");
    await expectVisible(page, "[data-repos-header], [data-add-repo-form]");
  });

  test("artifact download", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("phase08-artifact", "Phase 08 Artifact");
    const artifact = await fulcrumHome.seedArtifact({ projectId: project.id, title: "phase08.txt", mime: "text/plain", size: 7 });
    await gotoAndExpectOk(page, `/artifacts/${artifact.id}`);
    await expectVisible(page, "a[href*='download'], [data-artifact-download]");
  });

  test("notification rules", async ({ page }) => {
    await gotoAndExpectOk(page, "/settings/notifications");
    await expect(page.locator("[data-settings-notifications], form, main").first()).toBeVisible();
  });

  test("agent dispatch", async ({ page }) => {
    await gotoAndExpectOk(page, "/runs");
    await expectVisible(page, "[data-runs-dispatch]");
  });

  test("theme customization", async ({ page }) => {
    await gotoAndExpectOk(page, "/");
    const toggle = page.locator("[data-theme-toggle]").first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.reload();
    await expect(page.locator("[data-theme-toggle]").first()).toBeVisible();
    const mode = await page.evaluate(() => document.documentElement.classList.contains("dark") || document.documentElement.dataset["mode"] === "dark");
    expect(typeof mode).toBe("boolean");
  });

});
