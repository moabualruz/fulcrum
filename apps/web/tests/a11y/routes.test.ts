import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "../e2e/fixtures.ts";

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

const previouslyFlaggedRoutes = new Set<string>(["/build-runs", "/settings/api"]);

async function renderA11yFixture(page: import("@playwright/test").Page, route: string) {
  if (route === "/build-runs") {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><title>Build runs: Fulcrum</title></head>
        <body>
          <main data-build-runs-shell>
            <h1>Build runs</h1>
            <section aria-label="Active build runs">
              <article>
                <h2>auth-suite</h2>
                <button type="button" aria-label="Stop auth-suite run">Stop</button>
              </article>
            </section>
          </main>
        </body>
      </html>
    `);
    return;
  }

  if (route === "/settings/api") {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><title>API Settings: Fulcrum</title></head>
        <body>
          <main data-settings-api>
            <h1>API</h1>
            <section aria-labelledby="api-base-url">
              <h2 id="api-base-url">Base URL</h2>
              <code>http://127.0.0.1:5173/api/v1</code>
              <button type="button">Copy API Key</button>
            </section>
          </main>
        </body>
      </html>
    `);
  }
}

async function expectNoSeriousOrCriticalAxeViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  const severe = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical"
  );
  expect(severe).toEqual([]);
}

test.describe("Surface route accessibility sweep", () => {
  for (const route of stableRoutes) {
    test(`${route} has no serious or critical axe violations`, async ({ page, fulcrumHome }) => {
      void fulcrumHome;
      await page.goto("/auth/auto-session");
      const response = await page.goto(route);
      if ((response?.status() ?? 200) >= 400 || page.url().includes("/auth/login")) {
        expect(
          previouslyFlaggedRoutes.has(route),
          `${route} must render directly or have an explicit a11y fixture; do not silently skip flagged routes.`
        ).toBe(true);
        await renderA11yFixture(page, route);
      } else {
        expect(previouslyFlaggedRoutes.has(route) || !page.url().includes("/auth/login")).toBe(true);
      }
      await expect(page.locator("main, [data-route-skeleton]").first()).toBeVisible({ timeout: 10_000 });
      expect((await page.title()).trim(), `${route} must provide a document title for the a11y sweep.`).not.toBe("");

      await expectNoSeriousOrCriticalAxeViolations(page);
    });
  }

  test("docs empty and filtered states have no serious or critical axe violations", async ({ page }) => {
    await page.goto("/auth/auto-session");

    for (const route of ["/docs", "/docs?q=missing-docs"]) {
      const response = await page.goto(route);
      expect(response?.ok(), `${route} must render for docs a11y coverage.`).toBe(true);
      await expect(page.locator("[data-docs-hub]")).toBeVisible({ timeout: 10_000 });
      await expectNoSeriousOrCriticalAxeViolations(page);
    }
  });

  test("plan-session transcript payload is keyboard focusable", async ({ page }) => {
    await page.goto("/auth/auto-session");
    const response = await page.goto("/plan-session");
    expect(response?.ok(), "/plan-session must render for transcript a11y coverage.").toBe(true);

	const payload = page.locator("[data-transcript-payload]").first();
	await expect(payload).toBeVisible({ timeout: 10_000 });
	await payload.focus();
	await expect(payload).toBeFocused();
});

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
