import { expect, test } from "@playwright/test";

test("owned cockpit workflow has keyboard targets and non-color status text", async ({ page }) => {
  await page.route("**/api/v1/tasks?projectId=proj_access", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: [
          {
            taskId: "task_access",
            projectId: "proj_access",
            title: "Keyboard review task",
            status: "review",
            labels: ["merge"]
          }
        ]
      }
    });
  });

  await page.goto("/#/projects/proj_access");

  await expect(page.getByRole("navigation", { name: "Cockpit workflows" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Review queue" })).toBeFocused();
  await expect(page.getByText("Managed: available")).toBeVisible();
  const reviewQueue = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Review" }) });
  await expect(reviewQueue.getByLabel("Keyboard review task status")).toHaveText("review");
  await expect(reviewQueue.getByRole("button", { name: "Move to completed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compliance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Release evidence" })).toBeVisible();
});
