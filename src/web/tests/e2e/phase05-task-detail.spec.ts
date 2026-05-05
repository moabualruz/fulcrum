import { test, expect } from "./fixtures.ts";

test.describe("Phase 05 — Task Detail", () => {
  test("clicking a task opens detail panel with title, status, description", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("detail-test", "Detail Test");
    await seedTask({ projectId: proj.id, title: "Detail Task Alpha", status: "in_progress" });

    await page.goto(`/projects/${proj.id}/board`);
    await page.locator("[data-testid='task-card']").first().click();

    const detail = page.locator("[data-testid='task-detail-panel']");
    await expect(detail).toBeVisible();
    await expect(detail.locator("[data-testid='task-detail-title']")).toContainText("Detail Task Alpha");
    await expect(detail.locator("[data-testid='task-detail-status']")).toBeVisible();
    await expect(detail.locator("[data-testid='task-detail-description']")).toBeVisible();
  });

  test("comments tab shows comment list", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("comments-test", "Comments Test");
    await seedTask({ projectId: proj.id, title: "Commented Task", status: "todo" });

    await page.goto(`/projects/${proj.id}/board`);
    await page.locator("[data-testid='task-card']").first().click();

    const detail = page.locator("[data-testid='task-detail-panel']");
    await detail.locator("[data-testid='tab-comments']").click();
    await expect(detail.locator("[data-testid='comment-list']")).toBeVisible();
  });

  test("can submit a new comment", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("new-comment-test", "New Comment Test");
    await seedTask({ projectId: proj.id, title: "Commentable Task", status: "todo" });

    await page.goto(`/projects/${proj.id}/board`);
    await page.locator("[data-testid='task-card']").first().click();

    const detail = page.locator("[data-testid='task-detail-panel']");
    await detail.locator("[data-testid='tab-comments']").click();

    const commentInput = detail.locator("[data-testid='comment-input']");
    await commentInput.fill("This is a test comment");
    await detail.locator("[data-testid='comment-submit']").click();

    await expect(detail.locator("[data-testid='comment-item']")).toContainText("This is a test comment");
  });
});
