import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const crossCuttingRoutes = [
  "/settings/i18n",
  "/settings/theme",
  "/settings/telemetry",
  "/settings/errors",
  "/settings/backups",
  "/settings/data",
  "/settings/secrets",
  "/audit",
  "/settings/database/migrations",
] as const;

test.describe("Phase 09 cross-cutting WCAG 2.1 AA sweep", () => {
  for (const route of crossCuttingRoutes) {
    test(`${route} has no axe WCAG 2.1 AA violations`, async ({ page }) => {
      const response = await page.goto(route);
      test.skip((response?.status() ?? 200) >= 400, `${route} unavailable in isolated service setup.`);
      test.skip(page.url().includes("/auth/login"), `${route} requires authenticated session in isolated service setup.`);
      await expect(page.locator("main, [data-route-skeleton], body").first()).toBeVisible({ timeout: 10_000 });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
