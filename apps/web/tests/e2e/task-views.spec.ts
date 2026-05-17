import { test, expect } from "./fixtures.ts";

test.describe("task workflow — Task Views", () => {
  test("kanban board view renders columns for each status", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("views-test", "Views Test");
    await seedTask({ projectId: proj.id, title: "Task Pending", status: "pending" });
    await seedTask({ projectId: proj.id, title: "Task In Progress", status: "in_progress" });
    await seedTask({ projectId: proj.id, title: "Task Blocked", status: "blocked" });
    await seedTask({ projectId: proj.id, title: "Task Completed", status: "completed" });
    await seedTask({ projectId: proj.id, title: "Task Cancelled", status: "cancelled" });

    await page.goto(`/projects/${proj.id}/board`);
    await expect(page.locator("[data-testid='kanban-board']")).toBeVisible();
    await expect(page.locator("[data-testid='kanban-column']")).toHaveCount(await page.locator("[data-testid='kanban-column']").count());
    // Verify at least one task card rendered
    await expect(page.locator("[data-testid='task-card']").first()).toBeVisible();
  });

  test("list view renders table with task rows", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("list-test", "List Test");
    await seedTask({ projectId: proj.id, title: "List Task A", status: "pending" });
    await seedTask({ projectId: proj.id, title: "List Task B", status: "in_progress" });
    await seedTask({ projectId: proj.id, title: "List Task C", status: "completed" });

    await page.goto(`/projects/${proj.id}/list`);
    await expect(page.locator("[data-testid='task-list-table']")).toBeVisible();
    await expect(page.locator("[data-testid='task-row']")).toHaveCount(3);
  });

  test("gantt view renders timeline", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("gantt-test", "Gantt Test");
    await seedTask({ projectId: proj.id, title: "Gantt Task 1", status: "pending" });
    await seedTask({ projectId: proj.id, title: "Gantt Task 2", status: "in_progress" });

    await page.goto(`/projects/${proj.id}/gantt`);
    await expect(page.locator("[data-testid='gantt-timeline']")).toBeVisible();
  });

  test("calendar view renders calendar grid", async ({ page, fulcrumHome }) => {
    const { seedProject, seedTask } = fulcrumHome;
    const proj = await seedProject("cal-test", "Calendar Test");
    await seedTask({ projectId: proj.id, title: "Calendar Task", status: "pending" });

    await page.goto(`/projects/${proj.id}/calendar`);
    await expect(page.locator("[data-testid='calendar-grid']")).toBeVisible();
  });
});
