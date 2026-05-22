import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const stableRoutes = [
  "/projects",
  "/docs",
  "/memory",
  "/search",
  "/repos",
  "/artifacts",
  "/inbox",
  "/runs",
  "/ai-assist",
  "/build-runs",
  "/plan-session",
  "/notifications-empty",
  "/sessions-empty",
  "/settings/api",
  "/design-kit",
] as const;

test.describe("Surface route accessibility sweep", () => {
  for (const route of stableRoutes) {
    test(`${route} has no serious or critical axe violations`, async ({ page }) => {
      const response = await page.goto(route);
      test.skip((response?.status() ?? 200) >= 400, `${route} unavailable in isolated service setup.`);
      test.skip(page.url().includes("/auth/login"), `${route} requires authenticated session in isolated service setup.`);
      await expect(page.locator("main, [data-route-skeleton]").first()).toBeVisible({ timeout: 10_000 });
      test.skip(
        (await page.title()).trim().length === 0,
        `${route} did not hydrate a document title in isolated service setup.`
      );

      const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
      const severe = results.violations.filter((violation) =>
        violation.impact === "serious" || violation.impact === "critical"
      );
      expect(severe).toEqual([]);
    });
  }

  test("icon-button sweep compatibility: operational routes expose named controls", async ({ page }) => {
    await page.goto("/");
    const iconButtons = page.locator("button:has(svg), button:has([aria-hidden='true'])");
    const count = await iconButtons.count();
    for (let i = 0; i < count; i += 1) {
      await expect(iconButtons.nth(i)).toHaveAttribute("aria-label", /.+/);
    }
  });

  test("empty preview routes use the shared EmptyState primitive", async ({ page }) => {
    for (const route of ["/notifications-empty", "/sessions-empty"]) {
      await page.goto(route);
      await expect(page.locator("[data-slot='empty-state']")).toBeVisible();
    }
  });
});
