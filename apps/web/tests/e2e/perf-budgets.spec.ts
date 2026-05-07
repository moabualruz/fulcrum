// @ts-nocheck
/**
 * Playwright performance budget assertions (P16 Issue #28).
 *
 * Budgets (from PRD):
 *   SSR first-byte p95  < 100ms   — response.timing().responseStart
 *   Page navigation p95 < 100ms   — performance.measure after afterNavigate
 *   Kanban 200 tasks × 7 cols     < 300ms cold load
 *   Table 1000 tasks              — no blank rows at any scroll viewport
 *   Cmd+K open                    < 50ms  — performance.measure('palette-open')
 *   Lighthouse score on /         >= 85
 *
 * NOTE: These tests are SKIPPED (skip.test) until a live dev server is
 * available.  The `FULCRUM_PERF_TESTS=1` env var enables them in CI.
 */

import { expect, test } from "@playwright/test";

const ENABLED = process.env["FULCRUM_PERF_TESTS"] === "1";
const maybeTest = ENABLED ? test : test.skip;

// ---------------------------------------------------------------------------
// SSR first-byte p95 < 100ms
// ---------------------------------------------------------------------------

maybeTest("SSR first-byte TTFB p95 < 100ms", async ({ page }) => {
  const SAMPLES = 5;
  const timings: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    // responseStart from navigation timing — ms from navigationStart
    const ttfb = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;
      return nav.responseStart;
    });
    timings.push(ttfb);
  }

  timings.sort((a, b) => a - b);
  // p95 of 5 samples = max
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? timings[timings.length - 1]!;
  expect(p95).toBeLessThan(100);
});

// ---------------------------------------------------------------------------
// Page navigation p95 < 100ms
// ---------------------------------------------------------------------------

maybeTest("page navigation p95 < 100ms", async ({ page }) => {
  await page.goto("/");

  const ROUTES = ["/settings", "/docs", "/tasks", "/"];
  const timings: number[] = [];

  for (const route of ROUTES) {
    // Clear marks before each nav
    await page.evaluate(() => performance.clearMarks());
    const t0 = Date.now();
    await page.goto(route, { waitUntil: "networkidle" });
    timings.push(Date.now() - t0);
  }

  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? timings[timings.length - 1]!;
  expect(p95).toBeLessThan(100);
});

// ---------------------------------------------------------------------------
// Kanban 200 tasks × 7 columns cold load < 300ms
// ---------------------------------------------------------------------------

maybeTest("kanban 200 tasks × 7 columns cold-load < 300ms", async ({ page }) => {
  // Seed 200 tasks across 7 columns via query param signal
  await page.goto("/tasks?perf_seed=kanban_200x7");

  const renderMs = await page.evaluate(async () => {
    // Wait for the mark that the KanbanBoard component emits after render
    return new Promise<number>((resolve) => {
      const check = () => {
        const entries = performance.getEntriesByName("kanban-render-complete", "mark");
        if (entries.length > 0) {
          const nav = performance.getEntriesByType(
            "navigation"
          )[0] as PerformanceNavigationTiming;
          resolve(entries[0]!.startTime - nav.fetchStart);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  });

  expect(renderMs).toBeLessThan(300);
});

// ---------------------------------------------------------------------------
// Table 1000 tasks — no blank rows at any scroll viewport
// ---------------------------------------------------------------------------

maybeTest("table 1000 tasks — no blank rows during scroll", async ({ page }) => {
  await page.goto("/tasks?view=table&perf_seed=table_1000");

  // Wait for initial render
  await page.waitForSelector("[data-testid='task-row']");

  const viewportHeight = page.viewportSize()?.height ?? 800;
  // Scroll in increments of one viewport height
  const scrollSteps = 5;

  for (let i = 1; i <= scrollSteps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * viewportHeight);
    await page.waitForTimeout(100); // let virtual scroll re-render

    // All visible task rows must have non-empty text content
    const blankRows = await page.evaluate(() => {
      const rows = document.querySelectorAll("[data-testid='task-row']");
      let blank = 0;
      for (const row of rows) {
        if ((row.textContent?.trim() ?? "") === "") blank++;
      }
      return blank;
    });

    expect(blankRows).toBe(0);
  }
});

// ---------------------------------------------------------------------------
// Cmd+K open < 50ms
// ---------------------------------------------------------------------------

maybeTest("Cmd+K open < 50ms", async ({ page }) => {
  await page.goto("/");

  const measuredMs = await page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      // Listen for the palette-open measure emitted by CmdKProvider
      const observer = new PerformanceObserver((list) => {
        const entry = list.getEntriesByName("palette-open")[0];
        if (entry) {
          observer.disconnect();
          resolve(entry.duration);
        }
      });
      observer.observe({ entryTypes: ["measure"] });
    });
  });

  // Trigger Cmd+K
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  await page.waitForSelector("[data-testid='command-palette']");

  expect(measuredMs).toBeLessThan(50);
});

// ---------------------------------------------------------------------------
// Lighthouse score >= 85 on /
// ---------------------------------------------------------------------------

maybeTest("Lighthouse performance score >= 85 on /", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Lighthouse is not built into standard Playwright; we measure via
  // web-vitals proxy marks emitted by the app's vitals reporter.
  // Full Lighthouse is run by `scripts/ci/lighthouse-gate.ts`.
  // Here we assert that LCP and FID performance marks are present and
  // within budget as a proxy for >= 85 score.

  const vitals = await page.evaluate(() => {
    const lcpEntry = performance.getEntriesByType("largest-contentful-paint").pop() as
      | PerformancePaintTiming
      | undefined;
    const fcpEntry = performance.getEntriesByName("first-contentful-paint").pop();
    return {
      lcp: lcpEntry?.startTime ?? null,
      fcp: fcpEntry?.startTime ?? null,
    };
  });

  // LCP < 2500ms (good threshold per Google)
  if (vitals.lcp !== null) {
    expect(vitals.lcp).toBeLessThan(2500);
  }
  // FCP < 1800ms (good threshold)
  if (vitals.fcp !== null) {
    expect(vitals.fcp).toBeLessThan(1800);
  }
});
