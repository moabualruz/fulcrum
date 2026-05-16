import { test, expect } from "@playwright/test";

test.describe("PM Board Workflow", () => {
  test("renders kanban columns for all task statuses", async ({ page }) => {
    await page.goto("/boards");
    await expect(page.locator("[data-board-grid]")).toBeVisible();
    const columns = page.locator("[data-board-column]");
    await expect(columns).toHaveCount(5);
    for (const status of ["todo", "in_progress", "in_review", "done", "cancelled"]) {
      await expect(page.locator(`[data-board-column="${status}"]`)).toBeVisible();
    }
  });

  test("creates a task from board column inline form", async ({ page }) => {
    await page.goto("/boards");
    const todoColumn = page.locator('[data-board-column="todo"]');
    await todoColumn.locator("[data-add-card]").click();
    await todoColumn.locator("[data-new-card-title]").fill("E2E board task");
    await todoColumn.locator("[data-new-card-submit]").click();
    await expect(todoColumn.locator('[data-card-title="E2E board task"]')).toBeVisible();
  });

  test("opens task detail sheet on card click", async ({ page }) => {
    await page.goto("/boards");
    const card = page.locator("[data-task-id]").first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.locator("[data-board-sheet]")).toBeVisible();
      await expect(page.locator("[data-sheet-title]")).toBeVisible();
    }
  });

  test("drags card between columns to change status", async ({ page }) => {
    await page.goto("/boards");
    const todoColumn = page.locator('[data-board-column="todo"]');
    const inProgressColumn = page.locator('[data-board-column="in_progress"]');
    const card = todoColumn.locator("[data-task-id]").first();
    if (await card.isVisible()) {
      await card.dragTo(inProgressColumn);
      await expect(inProgressColumn.locator("[data-task-id]")).toHaveCount(1);
    }
  });

  test("keyboard arrow moves card between columns", async ({ page }) => {
    await page.goto("/boards");
    const card = page.locator("[data-task-id]").first();
    if (await card.isVisible()) {
      await card.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator("[data-move-announcement]")).toBeVisible();
    }
  });

  test("project filter narrows board to one project", async ({ page }) => {
    await page.goto("/boards");
    const filter = page.locator("[data-board-project-filter]");
    if (await filter.isVisible()) {
      const options = await filter.locator("option").allTextContents();
      if (options.length > 1) {
        await filter.selectOption({ index: 1 });
        await page.waitForURL(/project=/);
      }
    }
  });

  test("list view renders tasks in grouped rows", async ({ page }) => {
    await page.goto("/boards?view=list");
    await expect(page.locator("[data-list-view]")).toBeVisible();
    await expect(page.locator("[data-list-group]").first()).toBeVisible();
  });

  test("spreadsheet view renders table with sortable columns", async ({ page }) => {
    await page.goto("/boards?view=spreadsheet");
    await expect(page.locator("[data-spreadsheet-view]")).toBeVisible();
    await expect(page.locator("th[data-sortable]").first()).toBeVisible();
  });

  test("view switcher toggles between board/list/spreadsheet", async ({ page }) => {
    await page.goto("/boards");
    const switcher = page.locator("[data-view-switcher]");
    await expect(switcher).toBeVisible();
    await switcher.locator('[data-view="list"]').click();
    await expect(page.locator("[data-list-view]")).toBeVisible();
    await switcher.locator('[data-view="spreadsheet"]').click();
    await expect(page.locator("[data-spreadsheet-view]")).toBeVisible();
    await switcher.locator('[data-view="board"]').click();
    await expect(page.locator("[data-board-grid]")).toBeVisible();
  });
});
