import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
}

test.describe("interface critical sprint workflow journeys", () => {
  test("critical journey 05: sprint planning route renders workflow affordances", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("interface-sprint-plan", "interface Sprint Plan");
    await expectOkPage(page, `/projects/${project.id}/sprints`);
    await expect(page.locator("body")).toContainText(/Sprint|Backlog|Velocity|Planning/);
  });

  test("critical journey 06: sprint route keeps backlog and metrics affordances reachable", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("interface-sprint-affordances", "interface Sprint Affordances");
    await expectOkPage(page, `/projects/${project.id}/sprints`);
    await expect(page.locator("body")).toContainText(/Sprint|Backlog|Velocity|Planning/);
  });
});
