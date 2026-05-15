import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
}

test.describe("interface critical document journeys", () => {
  test("critical journey 07: docs index renders document CRUD entry points", async ({ page }) => {
    await expectOkPage(page, "/docs");
    await expect(page.locator("body")).toContainText(/Docs|Document|New|Create/);
  });

  test("critical journey 08: new doc route renders editor creation surface", async ({ page }) => {
    await expectOkPage(page, "/docs/new");
    await expect(page.locator("body")).toContainText(/New|Doc|Title|Editor|Create/);
  });
});
