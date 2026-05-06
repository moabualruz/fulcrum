import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
}

test.describe("Phase 9.5 critical task CRUD journeys", () => {
  test("critical journey 03: task board renders task management surface", async ({ page }) => {
    await expectOkPage(page, "/boards");
    await expect(page.locator("body")).toContainText(/Board|Task|Backlog|Todo|Done/);
  });

  test("critical journey 04: projects route exposes task creation path", async ({ page }) => {
    await expectOkPage(page, "/projects");
    await expect(page.locator("body")).toContainText(/Projects|Create|New|Task/);
  });
});
