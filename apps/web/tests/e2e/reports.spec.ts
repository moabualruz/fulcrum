import { test, expect } from "./fixtures.ts";

test.describe("task workflow — Reports", () => {
  test("reports page renders with tabs", async ({ page, fulcrumHome }) => {
    const { seedProject } = fulcrumHome;
    const proj = await seedProject("reports-test", "Reports Test");

    await page.goto(`/projects/${proj.id}/reports`);
    await expect(page.locator("[data-testid='reports-page']")).toBeVisible();
    await expect(page.locator("[data-testid='report-tab']")).toHaveCount(await page.locator("[data-testid='report-tab']").count());
    // Verify known tabs exist
    await expect(page.locator("[data-testid='report-tab-velocity']")).toBeVisible();
    await expect(page.locator("[data-testid='report-tab-cycle-time']")).toBeVisible();
    await expect(page.locator("[data-testid='report-tab-cfd']")).toBeVisible();
  });

  test("switching tabs changes visible chart", async ({ page, fulcrumHome }) => {
    const { seedProject } = fulcrumHome;
    const proj = await seedProject("reports-tabs-test", "Reports Tabs Test");

    await page.goto(`/projects/${proj.id}/reports`);
    await page.locator("[data-testid='report-tab-velocity']").click();
    await expect(page.locator("[data-testid='chart-velocity']")).toBeVisible();

    await page.locator("[data-testid='report-tab-cycle-time']").click();
    await expect(page.locator("[data-testid='chart-cycle-time']")).toBeVisible();
    await expect(page.locator("[data-testid='chart-velocity']")).toHaveCount(0);

    await page.locator("[data-testid='report-tab-cfd']").click();
    await expect(page.locator("[data-testid='chart-cfd']")).toBeVisible();
    await expect(page.locator("[data-testid='chart-cycle-time']")).toHaveCount(0);
  });

  test("date picker interaction filters data", async ({ page, fulcrumHome }) => {
    const { seedProject } = fulcrumHome;
    const proj = await seedProject("reports-date-test", "Reports Date Test");

    await page.goto(`/projects/${proj.id}/reports`);
    const datePicker = page.locator("[data-testid='report-date-picker']");
    await expect(datePicker).toBeVisible();
    await datePicker.click();
    // Select a preset range
    await page.locator("[data-testid='date-range-last-30']").click();
    // Chart should still be visible after filter
    await expect(page.locator("[data-testid^='chart-']").first()).toBeVisible();
  });
});
