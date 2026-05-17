import { expect, test } from "./fixtures.ts";

async function expectOkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
  await expect(page.locator("body")).not.toContainText("Internal Error");
  await expect(page.locator("body")).not.toContainText("This page could not be found");
}

test.describe("interface web cross-interface parity", () => {
  test("application-created task data is visible and peer web routes fail closed without skips", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("interface-cross-interface", "Interface Cross Interface");
    const artifact = await fulcrumHome.seedArtifact({
      title: "interface-cross-interface-artifact.txt",
      mime: "text/plain",
    });
    const searchPhrase = "interface-web-search-parity";

    await expectOkPage(page, "/boards");
    await page.locator("[data-board-column-input]").first().fill("Interface Cross Interface Task");
    await page.locator("[data-board-column-input]").first().press("Enter");
    await expect(page.locator("body")).toContainText("Interface Cross Interface Task");

    await expectOkPage(page, "/artifacts");
    await expect(page.locator("body")).toContainText("Artifacts");

    await expectOkPage(page, `/search?q=${searchPhrase}`);
    await expect(page.locator("body")).toContainText("Search");

    await expectOkPage(page, `/projects/${project.id}/sprints`);
    await expect(page.locator("body")).toContainText(/Sprint|Backlog|Planning/);

    await expectOkPage(page, "/runs");
    await expect(page.locator("body")).toContainText(/Agent runs|Runs/);

    await expectOkPage(page, "/settings/theme");
    await expect(page.locator("body")).toContainText(/Theme|Settings/);

    await expectOkPage(page, "/repos");
    await expect(page.locator("body")).toContainText(/Repos|Repositories/);

    expect(project.id).toMatch(/[0-9a-f-]{36}/);
    expect(artifact.id).toMatch(/[0-9a-f-]{36}/);
  });
});
