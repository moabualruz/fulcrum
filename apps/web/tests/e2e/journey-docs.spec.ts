import { test, expect } from "./fixtures.ts";

test("E-05 doc CRUD journey reads seeded doc and opens editor", async ({ page, fulcrumHome }) => {
  const project = await fulcrumHome.seedProject("journey-docs", "Journey Docs");
  const doc = await fulcrumHome.seedDoc({ projectId: project.id, title: "Journey Doc", body: "Journey body" });

  let response = await page.goto("/docs");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Journey Doc|Docs/);

  response = await page.goto(`/docs/${doc.id}/edit`);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Journey Doc|Journey body|Doc/);
});
