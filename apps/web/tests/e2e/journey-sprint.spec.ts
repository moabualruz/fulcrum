import { test, expect } from "./fixtures.ts";

test("E-04 sprint workflow journey reaches project sprint planning surfaces", async ({ page, fulcrumHome }) => {
  const project = await fulcrumHome.seedProject("journey-sprint", "Journey Sprint");
  await fulcrumHome.seedTask({ projectId: project.id, title: "Sprint Candidate", status: "pending", priority: 5 });

  let response = await page.goto(`/projects/${project.id}/sprints`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Sprint|Backlog|Journey Sprint/);

  response = await page.goto(`/projects/${project.id}/reports`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Report|Sprint|Velocity|Burndown/);
});
