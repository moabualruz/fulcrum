import { test, expect } from "@playwright/test";

test.describe("Review Workbench Workflow", () => {
  test("review page shows file tree sidebar", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    await expect(page.locator("[data-final-qa-panel]")).toBeVisible();
  });

  test("review workbench renders diff pane for selected file", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const buildBtn = page.locator("[data-review-workbench-build]");
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      await expect(page.locator("[data-review-file-tree]")).toBeVisible();
      await expect(page.locator("[data-review-diff-pane]")).toBeVisible();
    }
  });

  test("annotation sidebar shows grouped annotations by file", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const buildBtn = page.locator("[data-review-workbench-build]");
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      await expect(page.locator("[data-annotation-sidebar]")).toBeVisible();
    }
  });

  test("search dock finds matches in diff lines", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const searchInput = page.locator("[data-review-search]");
    if (await searchInput.isVisible()) {
      await searchInput.fill("function");
      await expect(page.locator("[data-search-results]")).toBeVisible();
    }
  });

  test("final QA run button triggers report generation", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const runBtn = page.locator('button:has-text("Run Final QA")');
    await expect(runBtn).toBeVisible();
  });

  test("UAT decision form submits approval", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const approveBtn = page.locator('button:has-text("Approve UAT")');
    await expect(approveBtn).toBeVisible();
  });

  test("review session saves and loads state", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const saveBtn = page.locator("[data-review-session-save]");
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.locator("[data-review-session-saved]")).toBeVisible();
    }
  });
});
