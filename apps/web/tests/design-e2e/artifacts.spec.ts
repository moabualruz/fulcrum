import { expect, test } from "../e2e/fixtures";

test.describe("artifacts route interaction coverage", () => {
  test("keeps route-specific controls and recovery visible when artifact API is unavailable", async ({ page }) => {
    await page.goto("/artifacts");

    await expect(page.locator("[data-artifacts-header]")).toContainText("Artifacts");
    await expect(page.locator("[data-artifacts-summary]")).toContainText("Visible artifacts");
    await expect(page.locator("[data-artifacts-filter]")).toBeVisible();
    await expect(page.locator("[data-selected-count]")).toContainText("0");
    await page.locator("[data-show-archived-toggle]").check();
    await page.locator("[data-apply-artifact-filters]").click();
    await expect(page).toHaveURL(/archived=true/);

    const error = page.locator("[data-artifacts-error]");
    if (await error.isVisible()) {
      await expect(error).toContainText("Artifacts could not load");
      await expect(error).toContainText("Retry");
      await expect(error).toContainText("artifacts-list");
    } else {
      await expect(page.locator("[data-empty-artifacts]").or(page.locator("[data-artifacts-list]")).first()).toBeVisible();
    }
  });

  test("keeps artifact route usable on mobile without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/artifacts");

    await expect(page.locator("[data-artifacts-header]")).toBeVisible();
    await expect(page.locator("[data-artifacts-filter]")).toBeVisible();
    await expect(page.locator("[data-artifacts-error]").or(page.locator("[data-empty-artifacts]").or(page.locator("[data-artifacts-mobile-list]"))).first()).toBeVisible();
    const overflow = await page.locator("main").last().evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
