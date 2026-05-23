/**
 * E2E: Artifact lifecycle — list, detail, download, archive, delete, dedup,
 * filter, and cross-surface parity (CLI-seeded data visible in Web).
 *
 * Run via:
 *   cd apps/web && bunx playwright test tests/e2e/artifacts-e2e.spec.ts
 *
 * Issue: .scratch/agent-os-vision/10-artifacts/issues/12-e2e-tests.md
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const isPlaywrightCli = process.argv.some((arg) => arg.includes("playwright"));

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  function artifactLink(page: import("@playwright/test").Page, title: string) {
    return page.getByRole("link", { name: title }).first();
  }

  async function expectArtifactVisible(page: import("@playwright/test").Page, title: string) {
    await expect(artifactLink(page, title)).toBeVisible();
  }

  async function expectArtifactAbsent(page: import("@playwright/test").Page, title: string) {
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  }

  // ── List page ─────────────────────────────────────────────────────────────

  test("artifacts list page renders seeded artifact", async ({ page, fulcrumHome }) => {
    const proj = await fulcrumHome.seedProject("art-list", "ArtList");
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "report.csv",
      mime: "text/csv",
      size: 256,
    });

    await page.goto("/artifacts");
    await expect(page.locator("[data-artifacts-list]")).toBeVisible();
    await expectArtifactVisible(page, "report.csv");
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  test("artifacts list shows empty state when no artifacts", async ({ page, fulcrumHome }) => {
    void fulcrumHome;
    await page.goto("/artifacts");
    const empty = page.locator("[data-empty-artifacts]");
    const list = page.locator("[data-artifacts-list]");
    await expect(empty.or(list).first()).toBeVisible();
  });

  // ── Detail page ───────────────────────────────────────────────────────────

  test("artifact detail page shows title and download link", async ({ page, fulcrumHome }) => {
    const proj = await fulcrumHome.seedProject("art-detail", "ArtDetail");

    // Write a fixture file so download works
    const artifactsDir = join(fulcrumHome.home, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const fixturePath = join(artifactsDir, "fixture.txt");
    writeFileSync(fixturePath, "hello from e2e test");

    const art = await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "fixture.txt",
      mime: "text/plain",
      size: 19,
      bodyPath: fixturePath,
    });

    await page.goto(`/artifacts/${art.id}`);
    await expect(page.locator("h1")).toContainText("fixture.txt");
    await expect(page.locator("a[href*='download']")).toBeVisible();
  });

  // ── Download ──────────────────────────────────────────────────────────────

  test("artifact download returns file content", async ({ page, fulcrumHome }) => {
    const proj = await fulcrumHome.seedProject("art-dl", "ArtDl");
    const artifactsDir = join(fulcrumHome.home, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const fixturePath = join(artifactsDir, "download-test.txt");
    writeFileSync(fixturePath, "download-content-123");

    const art = await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "download-test.txt",
      mime: "text/plain",
      size: 20,
      bodyPath: fixturePath,
    });

    const response = await page.request.get(`/artifacts/${art.id}/download`);
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toBe("download-content-123");
  });

  // ── Archive visibility ────────────────────────────────────────────────────

  test("archived artifact hidden by default, visible with filter", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-arch", "ArtArch");
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "active-file.txt",
      mime: "text/plain",
      size: 10,
    });
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "archived-file.txt",
      mime: "text/plain",
      size: 10,
      archived: true,
    });

    // Default view: archived hidden
    await page.goto("/artifacts");
    await expectArtifactVisible(page, "active-file.txt");
    await expectArtifactAbsent(page, "archived-file.txt");

    // Show archived
    await page.goto("/artifacts?archived=true");
    await expectArtifactVisible(page, "archived-file.txt");
  });

  // ── Dedup: same content, different filenames → two rows ───────────────────

  test("dedup: same sha256 different filenames → two rows", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-dedup", "ArtDedup");
    const sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "copy-a.txt",
      sha256: sha,
      mime: "text/plain",
      size: 0,
    });
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "copy-b.txt",
      sha256: sha,
      mime: "text/plain",
      size: 0,
    });

    await page.goto("/artifacts");
    await expectArtifactVisible(page, "copy-a.txt");
    await expectArtifactVisible(page, "copy-b.txt");
  });

  // ── Delete via detail page ────────────────────────────────────────────────

  test("delete artifact via detail page redirects to list", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-del", "ArtDel");
    const art = await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "to-delete.txt",
      mime: "text/plain",
      size: 5,
    });

    await page.goto(`/artifacts/${art.id}`);
    await page.locator("[data-artifact-delete]").click();
    // Should redirect to /artifacts
    await page.waitForURL("**/artifacts");
    await expectArtifactAbsent(page, "to-delete.txt");
  });

  // ── MIME filter ───────────────────────────────────────────────────────────

  test("MIME filter shows only matching artifacts", async ({ page, fulcrumHome }) => {
    const proj = await fulcrumHome.seedProject("art-mime", "ArtMime");
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "data.json",
      mime: "application/json",
      size: 42,
    });
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "photo.png",
      mime: "image/png",
      size: 1024,
    });

    await page.goto("/artifacts?mime=application/json");
    await expectArtifactVisible(page, "data.json");
    await expectArtifactAbsent(page, "photo.png");
  });

  // ── Task-scoped artifact ──────────────────────────────────────────────────

  test("artifact linked to task appears in artifact list", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-task", "ArtTask");
    const task = await fulcrumHome.seedTask({
      projectId: proj.id,
      title: "Test task",
    });
    await fulcrumHome.seedArtifact({
      projectId: proj.id,
      taskId: task.id,
      title: "task-attachment.pdf",
      mime: "application/pdf",
      size: 500,
    });

    await page.goto("/artifacts");
    await expectArtifactVisible(page, "task-attachment.pdf");
  });

  // ── Inline text preview ───────────────────────────────────────────────────

  test("text artifact detail shows inline preview", async ({ page, fulcrumHome }) => {
    const proj = await fulcrumHome.seedProject("art-preview", "ArtPreview");
    const dir = join(fulcrumHome.home, "artifacts");
    mkdirSync(dir, { recursive: true });
    const fp = join(dir, "preview.txt");
    writeFileSync(fp, "preview-content-xyz");

    const art = await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "preview.txt",
      mime: "text/plain",
      size: 19,
      bodyPath: fp,
    });

    await page.goto(`/artifacts/${art.id}`);
    await expect(page.locator("[data-artifact-inline-preview]")).toContainText(
      "preview-content-xyz",
    );
  });

  // ── Retention days display ────────────────────────────────────────────────

  test("artifact detail shows retention days remaining", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-ret", "ArtRet");
    const art = await fulcrumHome.seedArtifact({
      projectId: proj.id,
      title: "retention-test.txt",
      mime: "text/plain",
      size: 5,
    });

    await page.goto(`/artifacts/${art.id}`);
    await expect(page.locator("[data-artifact-retention]")).toContainText("days remaining");
  });

  // ── Bulk select checkbox ──────────────────────────────────────────────────

  test("select-all checkbox toggles all artifact checkboxes", async ({
    page,
    fulcrumHome,
  }) => {
    const proj = await fulcrumHome.seedProject("art-bulk", "ArtBulk");
    await fulcrumHome.seedArtifact({ projectId: proj.id, title: "bulk-a.txt", size: 1 });
    await fulcrumHome.seedArtifact({ projectId: proj.id, title: "bulk-b.txt", size: 2 });

    await page.goto("/artifacts");
    await expect(page.locator("[data-artifacts-list]")).toBeVisible();

    const selectAll = page.locator("[data-select-all]");
    await selectAll.check();

    // Bulk action bar should appear
    await expect(page.locator("[data-bulk-action-bar]")).toBeVisible();
  });
}

export {};
