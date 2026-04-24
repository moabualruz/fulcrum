import { expect, test } from "@playwright/test";

test("operator can create and transition a task from cockpit", async ({ page }) => {
  const tasks = [
    {
      taskId: "task_ready",
      projectId: "proj_owned",
      title: "Existing ready task",
      status: "ready",
      labels: []
    }
  ];

  await page.route("**/api/v1/tasks?projectId=proj_owned", async (route) => {
    await route.fulfill({ json: { status: "ok", data: tasks } });
  });
  await page.route("**/api/v1/tasks", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = (await route.request().postDataJSON()) as { title: string; projectId: string };
    await route.fulfill({
      json: {
        status: "ok",
        data: {
          taskId: "task_created",
          projectId: body.projectId,
          title: body.title,
          status: "pending",
          labels: ["cockpit"]
        }
      }
    });
  });
  await page.route("**/api/v1/tasks/task_ready/transition", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: { ...tasks[0], status: "running" }
      }
    });
  });
  await page.route("**/api/v1/tasks/task_created/transition", async (route) => {
    const body = (await route.request().postDataJSON()) as { status: string };
    await route.fulfill({
      json: {
        status: "ok",
        data: {
          taskId: "task_created",
          projectId: "proj_owned",
          title: "Owned cockpit task",
          status: body.status,
          labels: ["cockpit"]
        }
      }
    });
  });

  await page.goto("/#/projects/proj_owned");
  await page.getByLabel("Title").fill("Owned cockpit task");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Task created")).toBeVisible();
  await expect(page.getByText("Owned cockpit task")).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Owned cockpit task" })
    .getByRole("button", { name: "Move to ready" })
    .click();
  await expect(page.getByText("Task moved to ready")).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Owned cockpit task" })
      .getByRole("button", { name: "Move to running" })
  ).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "Existing ready task" })
    .getByRole("button", { name: "Move to running" })
    .click();
  await expect(page.getByText("Task moved to running")).toBeVisible();
  await expect(page.getByText("Existing ready task")).toBeHidden();
});
