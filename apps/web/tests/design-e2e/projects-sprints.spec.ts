import { expect, test } from "../e2e/fixtures";

test.describe("projects sprints route interaction coverage", () => {
  test("creates, opens, starts, completes, and revisits project sprints", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("sprints-design-desktop", "Sprints Design Desktop");
    await page.goto("/auth/auto-session");
    await page.goto(`/projects/${project.id}/sprints`);

    await expect(page.locator("[data-project-sprints]")).toBeVisible();
    await expect(page.getByText("No sprints yet")).toBeVisible();

    await page.locator(`[data-project-sprints] a[href='/projects/${project.id}']`).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    await page.goBack();

    await page.locator("[data-new-sprint-btn]").click();
    await expect(page.locator("[data-create-sprint-form]")).toBeVisible();
    await page.getByLabel("Name").fill("Hardening Sprint");
    await page.getByLabel("Goal").fill("Stabilize route workflows");
    await page.getByLabel("Capacity (points)").fill("21");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.locator("[data-sprint-card][data-sprint-status='planned']")).toContainText("Hardening Sprint");
    await page.locator("[data-start-sprint-btn]").click();
    await expect(page.locator("[data-sprint-card][data-sprint-status='active']")).toContainText("Hardening Sprint");

    await page.getByRole("link", { name: "Hardening Sprint" }).click();
    await expect(page.locator("[data-sprint-header]")).toBeVisible();
    await page.goBack();

    await page.locator("[data-complete-sprint-btn]").click();
    await expect(page.locator("[data-sprint-card][data-sprint-status='completed']")).toContainText("Hardening Sprint");

    await test.info().attach("projects-sprints-desktop", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("keeps sprint creation and lists usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("sprints-design-mobile", "Sprints Design Mobile");
    await page.goto("/auth/auto-session");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${project.id}/sprints`);

    await page.locator("[data-new-sprint-btn]").click();
    await page.getByLabel("Name").fill("Mobile Sprint");
    await page.getByLabel("Goal").fill("Keep sprint controls reachable");
    await page.getByLabel("Capacity (points)").fill("13");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("[data-sprint-card]")).toContainText("Mobile Sprint");

    const overflow = await page.locator("[data-project-sprints]").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await test.info().attach("projects-sprints-mobile", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("falls back to project recovery when the project is missing", async ({ page }) => {
    await page.goto("/auth/auto-session");
    const response = await page.goto("/projects/missing-project-id/sprints");
    expect(response?.status()).toBe(404);
    await expect(page.locator("[data-project-detail-error]")).toBeVisible();
  });
});
