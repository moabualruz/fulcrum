import { test, expect } from "@playwright/test";

test("cockpit project board exposes keyboard-focusable non-color status text", async ({ page }) => {
  await page.route("**/api/v1/projects", async (route) => {
    await route.fulfill({
      json: {
        schemaVersion: "1.0",
        status: "ok",
        data: [
          {
            project: {
              projectId: "proj_demo",
              name: "Demo Project",
              healthState: "managed",
              privacyMode: "local_only"
            },
            counts: { tasks: 2, runs: 1, blockers: 1, review: 1, merge: 1 },
            degraded: ["semantic_search"]
          }
        ]
      }
    });
  });
  await page.route("**/api/v1/tasks?projectId=proj_demo", async (route) => {
    await route.fulfill({
      json: {
        schemaVersion: "1.0",
        status: "ok",
        data: [
          {
            taskId: "task_blocked",
            projectId: "proj_demo",
            title: "Blocked task",
            status: "blocked",
            labels: []
          },
          {
            taskId: "task_merge",
            projectId: "proj_demo",
            title: "Merge task",
            status: "review",
            labels: ["merge"]
          }
        ]
      }
    });
  });

  await page.goto("/#/projects/proj_demo");

  await page.getByRole("article").filter({ hasText: "Blocked" }).focus();
  await expect(page.getByRole("article").filter({ hasText: "Blocked" })).toBeFocused();
  await expect(page.getByText("Managed: available")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Merge" })).toBeVisible();
  await expect(page.getByText("Blocked task")).toBeVisible();
  await expect(page.getByText("Merge task").first()).toBeVisible();
});
