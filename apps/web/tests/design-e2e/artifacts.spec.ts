import { expect, test } from "../e2e/fixtures";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `/artifacts` is re-homed to the Ship stage workbench (`/ship`) per
 * `IA-MAP.md §2.5` and `design-alignment/ship.md`. The list route 301-redirects
 * to `/ship`; the `/artifacts/[id]` detail route and `/artifacts/[id]/download`
 * endpoint are preserved unchanged (no feature loss) — those tests stay below.
 */
test.describe("artifacts route re-home + preserved detail/download", () => {
  test("the legacy /artifacts list 301-redirects to the Ship workbench", async ({ page }) => {
    await page.goto("/artifacts");

    // The list view resolves to the canonical Ship route — never a 404.
    await expect(page).toHaveURL(/\/ship$/);
    await expect(page.locator("[data-route='ws-stage'][data-stage='ship']")).toBeVisible();
    await expect(page.locator("[data-ship-toolbar]")).toContainText("Artifacts");
  });

  test("the /artifacts redirect carries the filter query string forward to /ship", async ({
    page,
  }) => {
    await page.goto("/artifacts?archived=true");

    await expect(page).toHaveURL(/\/ship\?archived=true$/);
    await expect(page.locator("[data-ship-release-table]")).toBeVisible();
  });

  test("keeps the re-homed surface usable on mobile without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/artifacts");

    await expect(page).toHaveURL(/\/ship$/);
    await expect(page.locator("[data-ship-toolbar]")).toBeVisible();
    // The route container never overflows the viewport horizontally; the
    // release table scrolls inside `[data-ship-table-wrap]` by design.
    const overflow = await page
      .locator("[data-route='ws-stage']")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
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
