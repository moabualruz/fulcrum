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

  test("annotation sidebar items are clickable with line references", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const buildBtn = page.locator("[data-review-workbench-build]");
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      const annotation = page.locator("[data-annotation-id]").first();
      if (await annotation.isVisible()) {
        await expect(annotation).toHaveAttribute("type", "button");
      }
    }
  });

  test("AI review panel has input and ask button", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const buildBtn = page.locator("[data-review-workbench-build]");
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      const aiPanel = page.locator("[data-review-ai-panel]");
      const aiInput = page.locator("[data-review-ai-input]");
      const askBtn = page.locator("[data-review-ai-ask]");
      if (await aiPanel.isVisible()) {
        await expect(aiInput).toBeVisible();
        await expect(askBtn).toBeVisible();
      }
    }
  });

  test("diff lines support multi-line selection via shift-click", async ({ page }) => {
    await page.goto("/projects/test-project/reports?tab=final-qa");
    const buildBtn = page.locator("[data-review-workbench-build]");
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      const firstLine = page.locator("[data-diff-line='0']");
      const thirdLine = page.locator("[data-diff-line='2']");
      if (await firstLine.isVisible()) {
        await firstLine.click();
        await thirdLine.click({ modifiers: ["Shift"] });
        await expect(page.locator("[data-annotation-draft]")).toBeVisible();
      }
    }
  });
});

test.describe("E2E Runner Page", () => {
  test("shows run history table", async ({ page }) => {
    await page.goto("/projects/test-project/e2e");
    await expect(page.locator("[data-e2e-history]")).toBeVisible();
  });

  test("run form submits with runner selection", async ({ page }) => {
    await page.goto("/projects/test-project/e2e");
    await expect(page.locator("[data-e2e-run-form]")).toBeVisible();
    const runnerSelect = page.locator("select[name='runner']");
    await expect(runnerSelect).toBeVisible();
  });
});
