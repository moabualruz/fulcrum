import { expect, test } from "../e2e/fixtures";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test.describe("artifacts route interaction coverage", () => {
  test("keeps route-specific controls and recovery visible when artifact API is unavailable", async ({ page }) => {
    await page.goto("/artifacts");

    await expect(page.locator("[data-artifacts-header]")).toContainText("Artifacts");
    await expect(page.locator("[data-artifacts-summary]")).toContainText("Visible artifacts");
    await expect(page.locator("[data-artifacts-filter]")).toBeVisible();
    await expect(page.locator("[data-selected-count]")).toContainText("0");
    await page.locator("[data-show-archived-toggle]").check();
    await page.locator("[data-apply-artifact-filters]").click();
    await expect(page).toHaveURL(/archived=true/);

    const error = page.locator("[data-artifacts-error]");
    if (await error.isVisible()) {
      await expect(error).toContainText("Artifacts could not load");
      await expect(error).toContainText("Retry");
      await expect(error).toContainText("artifacts-list");
    } else {
      await expect(page.locator("[data-empty-artifacts]").or(page.locator("[data-artifacts-list]")).first()).toBeVisible();
    }
  });

  test("keeps artifact route usable on mobile without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/artifacts");

    await expect(page.locator("[data-artifacts-header]")).toBeVisible();
    await expect(page.locator("[data-artifacts-filter]")).toBeVisible();
    await expect(page.locator("[data-artifacts-error]").or(page.locator("[data-empty-artifacts]").or(page.locator("[data-artifacts-mobile-list]"))).first()).toBeVisible();
    const overflow = await page.locator("main").last().evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("surfaces upload, provenance filters, and recovery when artifact API is unavailable", async ({ page }) => {
    const traceId = "trace-design-artifacts";
    await page.goto(`/artifacts?trace=${traceId}`);

    await expect(page.locator("[data-artifact-upload]")).toBeVisible();
    await expect(page.locator("[data-artifact-upload-filename]")).toBeVisible();
    await expect(page.locator("[data-artifact-upload-project]")).toBeVisible();
    await expect(page.locator("[data-artifact-upload-trace]")).toBeVisible();
    await expect(page.locator("[data-artifact-upload-submit]")).toBeVisible();
    await expect(page.locator("[data-artifacts-project-filter]")).toBeVisible();
    await expect(page.locator("[data-artifacts-run-filter]")).toBeVisible();
    await expect(page.locator("[data-artifacts-task-filter]")).toBeVisible();
    await expect(page.locator("[data-artifacts-trace-filter]")).toHaveValue(traceId);
    await expect(page.locator("[data-artifacts-error]").or(page.locator("[data-empty-artifacts]")).first()).toBeVisible();
  });

  test("exercises artifact detail controls at desktop and mobile widths", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("artifact-detail-design", "Artifact Detail Design");
    const artifactsDir = join(fulcrumHome.home, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const bodyPath = join(artifactsDir, "detail-preview.txt");
    writeFileSync(bodyPath, "artifact-detail-preview");
    const artifact = await fulcrumHome.seedArtifact({
      projectId: project.id,
      title: "detail-preview.txt",
      mime: "text/plain",
      size: 23,
      bodyPath,
    });

    await page.goto(`/artifacts/${artifact.id}`);

    await expect(page.locator("[data-artifact-detail-header]")).toContainText("detail-preview.txt");
    await expect(page.locator("[data-artifact-detail-metadata]")).toContainText("text/plain");
    await expect(page.locator("[data-artifact-inline-preview]")).toContainText("artifact-detail-preview");
    await expect(page.locator("[data-artifact-download]")).toHaveAttribute("href", new RegExp(`/artifacts/${artifact.id}/download`));
    await expect(page.locator("[data-artifact-delete]")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-artifact-detail-header]")).toBeVisible();
    await expect(page.locator("[data-artifact-download]")).toBeVisible();
    await expect(page.locator("[data-artifact-delete]")).toBeVisible();
    const overflow = await page.locator("main").last().evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps missing artifact recovery inline", async ({ page }) => {
    await page.goto("/artifacts/missing-artifact-id");

    await expect(page.locator("[data-artifact-detail-error]")).toContainText("Artifact could not load");
    await expect(page.locator("[data-artifact-detail-error]")).toContainText("Recovery:");
    await expect(page.locator("[data-artifact-detail-error] a[href='/artifacts']")).toBeVisible();
  });

  test("downloads artifact bytes with safe headers and fails closed for missing files", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("artifact-download-design", "Artifact Download Design");
    const artifactsDir = join(fulcrumHome.home, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const bodyPath = join(artifactsDir, "download-proof.txt");
    writeFileSync(bodyPath, "download-proof-body");
    const artifact = await fulcrumHome.seedArtifact({
      projectId: project.id,
      title: 'download "proof".txt',
      mime: "text/plain",
      size: 19,
      bodyPath,
    });

    const response = await page.request.get(`/artifacts/${artifact.id}/download`);
    expect(response.ok()).toBe(true);
    await expect(response.text()).resolves.toBe("download-proof-body");
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(response.headers()["content-disposition"]).toBe('attachment; filename="download proof.txt"');

    const missing = await page.request.get("/artifacts/missing-artifact-id/download");
    expect(missing.status()).toBe(404);
  });
});
