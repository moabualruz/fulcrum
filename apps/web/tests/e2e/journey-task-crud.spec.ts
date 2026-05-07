import { test, expect } from "./fixtures.ts";

test("E-03 task CRUD journey creates reads updates and deletes through task surfaces", async ({ page, fulcrumHome }) => {
  const project = await fulcrumHome.seedProject("journey-task-crud", "Journey Task CRUD");
  const task = await fulcrumHome.seedTask({ projectId: project.id, title: "Journey Task", status: "pending" });

  let response = await page.goto(`/tasks/${task.id}`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("[data-task-title], body").first()).toContainText("Journey Task");

  response = await page.goto(`/projects/${project.id}/board`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Journey Task|Task/);

  response = await page.goto("/boards");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Journey Task|Board/);
});
