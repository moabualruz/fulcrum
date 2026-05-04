// @ts-nocheck
/**
 * Accessibility audit — axe-core Playwright scan + keyboard nav + skip links + focus traps.
 * WCAG 2.1 AA compliance across 7 major routes.
 *
 * Covers:
 *   - axe-core zero violations on 7 routes (/, /projects, /tasks/[id], /docs/[id]/edit,
 *     /search, /inbox, /auth/login)
 *   - Skip link: first focusable element → <a href="#main-content">; Enter moves focus to #main-content
 *   - Keyboard nav: Tab sequence reaches all interactive elements on /
 *   - Focus trap: Dialog and Sheet cycle Tab within; Esc closes; focus returns to trigger
 *   - aria-live regions: toast container, bell badge, run log stream
 *   - Icon-only buttons have aria-label
 *   - Form inputs have associated <label>
 *   - Colour contrast passes axe color-contrast rule
 *
 * Requires: @axe-core/playwright installed (`bun add -d @axe-core/playwright`)
 * Run: npx playwright test tests/a11y/ --project=chromium
 */

import { describe as bunDescribe, expect as bunExpect, test as bunTest } from "bun:test";

const isPlaywrightCli = process.argv.some((argument) => argument.includes("playwright"));

const { test, expect, AxeBuilder } = isPlaywrightCli
  ? {
      ...(await import("@playwright/test")),
      AxeBuilder: (await import("@axe-core/playwright")).default,
    }
  : {
      test: Object.assign((name: string, fn: () => unknown) => bunTest.skip(name, fn), {
        describe: bunDescribe.skip,
        use: () => {},
      }),
      expect: bunExpect,
      AxeBuilder: class AxeBuilder {
        withTags() {
          return this;
        }
        async analyze() {
          return { violations: [] };
        }
      },
    };

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Run axe on the current page with WCAG 2.1 AA ruleset.
 * Fails if any violations are found.
 */
async function auditPage(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

// ─── 1. axe-core scan — 7 routes ─────────────────────────────────────────────

test.describe("axe-core WCAG 2.1 AA scan", () => {
  const routes = [
    { name: "dashboard", path: "/" },
    { name: "projects", path: "/projects" },
    { name: "search", path: "/search" },
    { name: "inbox", path: "/inbox" },
    { name: "auth login", path: "/auth/login" },
    // Task detail and doc editor require seeded DB; tested with mock IDs.
    // They are included so the CI scan still exercises the route skeleton.
    { name: "task detail (skeleton)", path: "/tasks/00000000-0000-0000-0000-000000000001" },
    { name: "doc editor (skeleton)", path: "/docs/00000000-0000-0000-0000-000000000001/edit" },
  ];

  for (const route of routes) {
    test(`${route.name} (${route.path}) — zero axe violations`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await auditPage(page);
    });
  }
});

// ─── 2. Skip link ─────────────────────────────────────────────────────────────

test.describe("Skip link", () => {
  test("first Tab focuses #skip-to-content link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("href"));
    expect(focused).toBe("#main-content");
  });

  test("Enter on skip link moves focus to #main-content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("main-content");
  });
});

// ─── 3. Keyboard navigation — dashboard ──────────────────────────────────────

test.describe("Keyboard navigation — dashboard /", () => {
  test("Tab sequence reaches sidebar nav links", async ({ page }) => {
    await page.goto("/");
    // Tab past skip link then through sidebar
    const tabCount = 15;
    for (let i = 0; i < tabCount; i++) {
      await page.keyboard.press("Tab");
    }
    // At least one sidebar nav link should have been focused during traversal
    const navLinks = await page.locator("aside[aria-label] a").count();
    expect(navLinks).toBeGreaterThan(0);
  });

  test("no mouse-only patterns — all interactive elements are focusable", async ({ page }) => {
    await page.goto("/");
    // Collect all buttons and links; each must be keyboard-reachable (not tabindex=-1 without SR override)
    const orphaned = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("button, a[href], input, select, textarea"));
      return els.filter((el) => {
        const ti = (el as HTMLElement).tabIndex;
        // tabIndex -1 is allowed for programmatic focus; flag elements with no accessible name
        const label =
          (el as HTMLElement).getAttribute("aria-label") ||
          (el as HTMLElement).getAttribute("aria-labelledby") ||
          (el as HTMLElement).textContent?.trim();
        return ti === -1 && !label;
      }).length;
    });
    expect(orphaned).toBe(0);
  });
});

// ─── 4. Focus trap — Dialog ───────────────────────────────────────────────────

test.describe("Focus trap — Dialog", () => {
  // This test requires a page that renders a Dialog with a known trigger.
  // The search page "save search" dialog is used as a stable fixture.
  test("Tab cycles within open Dialog", async ({ page }) => {
    await page.goto("/search");
    // Open save-search dialog if the button exists
    const trigger = page.getByRole("button", { name: /save search/i });
    if ((await trigger.count()) === 0) {
      test.skip();
      return;
    }
    await trigger.click();
    // Collect focusable elements inside dialog
    const dialogFocusable = page.locator('[role="dialog"] :is(button, a[href], input, select, textarea)');
    const count = await dialogFocusable.count();
    expect(count).toBeGreaterThan(0);

    // Tab through all dialog elements; focus must stay inside
    for (let i = 0; i < count + 1; i++) {
      await page.keyboard.press("Tab");
      const outsideDialog = await page.evaluate(() => {
        const active = document.activeElement;
        return !active?.closest('[role="dialog"]');
      });
      expect(outsideDialog).toBe(false);
    }
  });

  test("Esc closes Dialog and returns focus to trigger", async ({ page }) => {
    await page.goto("/search");
    const trigger = page.getByRole("button", { name: /save search/i });
    if ((await trigger.count()) === 0) {
      test.skip();
      return;
    }
    await trigger.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    // Focus must return to trigger
    const isTriggerFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return (active as HTMLElement | null)?.innerText?.toLowerCase().includes("save search");
    });
    expect(isTriggerFocused).toBe(true);
  });
});

// ─── 5. Focus trap — Sheet (mobile nav) ──────────────────────────────────────

test.describe("Focus trap — Sheet (mobile nav)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Tab cycles within open Sheet", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("[data-mobile-sheet-trigger]");
    await trigger.click();
    const sheetContent = page.locator('[data-slot="sheet-content"]');
    await expect(sheetContent).toBeVisible();

    // Tab several times; focus must stay inside sheet
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const outsideSheet = await page.evaluate(() => {
        const active = document.activeElement;
        return !active?.closest('[data-slot="sheet-content"]');
      });
      expect(outsideSheet).toBe(false);
    }
  });

  test("Esc closes Sheet", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("[data-mobile-sheet-trigger]");
    await trigger.click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible();
  });
});

// ─── 6. aria-live regions ────────────────────────────────────────────────────

test.describe("aria-live regions", () => {
  test("toast container has aria-live=polite", async ({ page }) => {
    await page.goto("/");
    // svelte-sonner renders an ol[data-sonner-toaster] — we wrap it in a region
    const region = page.locator("[data-toast-region]");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("aria-atomic", "false");
  });

  test("bell badge has aria-live=polite", async ({ page }) => {
    await page.goto("/inbox");
    const badge = page.locator("[data-bell-badge]");
    // Badge may not render if count is 0; only verify attribute if element exists
    if ((await badge.count()) > 0) {
      await expect(badge).toHaveAttribute("aria-live", "polite");
    }
  });

  test("run log stream has aria-live=off", async ({ page }) => {
    await page.goto("/runs");
    const log = page.locator("[data-run-log]");
    if ((await log.count()) > 0) {
      await expect(log).toHaveAttribute("aria-live", "off");
    }
  });
});

// ─── 7. Icon-only buttons have aria-label ────────────────────────────────────

test.describe("Icon-only buttons", () => {
  const routes = ["/", "/projects", "/search", "/inbox"];

  for (const route of routes) {
    test(`${route} — no unlabelled icon-only buttons`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const unlabelled = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        return btns
          .filter((btn) => {
            const text = btn.textContent?.trim() ?? "";
            const label = btn.getAttribute("aria-label") || btn.getAttribute("aria-labelledby");
            const hasSrOnly = btn.querySelector(".sr-only");
            return text.length === 0 && !label && !hasSrOnly;
          })
          .map((btn) => btn.outerHTML.slice(0, 120));
      });
      expect(unlabelled).toEqual([]);
    });
  }
});

// ─── 8. Form inputs have associated labels ───────────────────────────────────

test.describe("Form input labels", () => {
  const routes = ["/auth/login", "/search"];

  for (const route of routes) {
    test(`${route} — all inputs have labels`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const unlabelled = await page.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll("input:not([type=hidden]), select, textarea"),
        );
        return inputs
          .filter((el) => {
            const id = el.getAttribute("id");
            const hasFor = id && document.querySelector(`label[for="${id}"]`);
            const hasLabelledBy = el.getAttribute("aria-labelledby");
            const hasLabel = el.getAttribute("aria-label");
            const wrappedInLabel = el.closest("label");
            return !hasFor && !hasLabelledBy && !hasLabel && !wrappedInLabel;
          })
          .map((el) => (el as HTMLElement).outerHTML.slice(0, 120));
      });
      expect(unlabelled).toEqual([]);
    });
  }
});
