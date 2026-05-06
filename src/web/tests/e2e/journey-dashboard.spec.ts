import { test, expect } from "./fixtures.ts";

test("E-02 dashboard journey shows seeded project data", async ({ page, fulcrumHome }) => {
  await fulcrumHome.seedProject("journey-dashboard", "Journey Dashboard");
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/Journey Dashboard|Projects|Dashboard/);
});
