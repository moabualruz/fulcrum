import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
  return page.locator("body");
}

test.describe("interface critical dashboard journeys", () => {
  test("critical journey 01: dashboard renders project entry points", async ({ page }) => {
    const body = await expectOkPage(page, "/");
    await expect(body).toContainText(/Fulcrum|Dashboard|Projects/);
    await expect(page.locator("a[href='/projects']").first()).toBeVisible();
  });

  test("critical journey 02: project list is reachable from dashboard nav", async ({ page }) => {
    await expectOkPage(page, "/");
    await page.locator("a[href='/projects']").first().click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator("body")).toContainText(/Projects|No projects|Create/);
  });
});
