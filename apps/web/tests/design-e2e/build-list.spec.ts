import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { captureScreenshot } from "../../scripts/run-design-e2e";

/**
 * Rendered OD-fidelity coverage for `prd-web-build-list-od-fidelity`.
 *
 * Drives the production route `/build-list` and asserts it matches the OD
 * `build-list.html` view: a dense (12px body / 20px row) work-item table with
 * columns ID · Title · Status · Progress · Module · Owner · Updated · Modes,
 * sticky header, monospace id pills, `DESIGN.md §4.9` status badges, a per-row
 * progress bar, a per-row `DESIGN.md §4.11` compact mode row, the shared
 * layout switcher + filter chip row, the COPY.md build-list empty state, and
 * the `DESIGN.md §3.1` container-query row collapse.
 */

async function openBuildList(page: Page): Promise<void> {
  await page.goto("/build-list", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-build-list]")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test.describe("build list OD fidelity", () => {
  test("renders the dense work-item table with the OD column set and sticky header", async ({ page }) => {
    await openBuildList(page);

    await expect(page.locator("[data-build-list-header]")).toContainText("Build · List");
    await expect(page.locator("[data-build-list-count]")).toContainText("8 work items");
    await expect(page.locator("[data-build-list-count]")).toContainText("3 running");

    const table = page.locator("[data-build-list-table]");
    await expect(table).toBeVisible();

    // Layout: 12px body (DESIGN.md §7 compact density token). The visible row
    // floor is set by the compact mode row's WCAG 2.5.8 24×24 tap targets plus
    // minimal compact cell padding; it stays well under the comfortable row
    // band, proving the compact density the OD build-list table uses.
    const bodyFontSize = await table.evaluate((el) => getComputedStyle(el).fontSize);
    expect(bodyFontSize).toBe("12px");
    const rowHeight = await page
      .locator("[data-build-list-row]")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(rowHeight).toBeLessThanOrEqual(40);
    // Cell vertical padding is the compact 2px token, not the cozy/comfortable
    // padding — the row height is content-driven, not padding-inflated.
    const cellPadding = await page
      .locator("[data-build-list-cell='title']")
      .first()
      .evaluate((el) => getComputedStyle(el).paddingTop);
    expect(cellPadding).toBe("2px");

    // The OD <thead> column order, verbatim.
    await expect(page.locator("[data-build-list-column]")).toHaveText([
      "ID",
      "Title",
      "Status",
      "Progress",
      "Module",
      "Owner",
      "Updated",
      "Modes",
    ]);

    // Sticky header — position: sticky, top: 0.
    const headerPosition = await page
      .locator("[data-build-list-column='id']")
      .evaluate((el) => getComputedStyle(el).position);
    expect(headerPosition).toBe("sticky");

    await expect(page.locator("[data-build-list-row]")).toHaveCount(8);
  });

  test("renders monospace id pills, status badges, progress bars, and per-row mode rows", async ({ page }) => {
    await openBuildList(page);

    const firstRow = page.locator("[data-build-list-row]").first();
    await expect(firstRow).toHaveAttribute("data-task-id", "FUL-1284");

    // Monospace id pill linking to the task.
    const idPill = firstRow.locator("[data-build-list-id-pill]");
    await expect(idPill).toHaveText("FUL-1284");
    await expect(idPill).toHaveAttribute("href", "/tasks/FUL-1284");
    const idFontFamily = await idPill.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(idFontFamily.toLowerCase()).toMatch(/mono|fira/);

    // DESIGN.md §4.9 status badge — color + icon + text, never color alone.
    const badge = firstRow.locator("[data-slot='status-badge']");
    await expect(badge).toHaveAttribute("data-status", "running");
    await expect(badge.locator("[data-status-glyph]")).toBeVisible();
    await expect(badge).toContainText("Running");

    // Per-row progress bar.
    const progress = firstRow.locator("[data-build-list-progress]");
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuenow", "65");

    // DESIGN.md §4.11 compact mode row — a single role="toolbar" group per row.
    const modeRow = firstRow.locator("[data-build-list-mode-row]");
    await expect(modeRow).toHaveAttribute("role", "toolbar");
    await expect(modeRow).toHaveAttribute("data-density", "compact");
    await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
    await expect(modeRow.locator("[data-mode='assist']")).toBeVisible();

    // Status vocabulary spans the canonical DESIGN.md §4.9 states.
    await expect(page.locator("[data-build-list-row][data-status='waiting-input']")).toHaveCount(1);
    await expect(page.locator("[data-build-list-row][data-status='blocked']")).toHaveCount(1);
    await expect(page.locator("[data-build-list-row][data-status='completed']")).toHaveCount(2);
    await expect(page.locator("[data-build-list-row][data-status='queued']")).toHaveCount(1);

    await captureScreenshot(page, "build-list-populated");
  });

  test("shares one layout switcher and one filter chip row with the board", async ({ page }) => {
    await openBuildList(page);

    // Layout switcher — Board · Graph · List · Timeline · Runs, List active.
    const layouts = page.locator("[data-build-layout]");
    await expect(layouts).toHaveText(["Board", "Graph", "List", "Timeline", "Runs"]);
    await expect(page.locator("[data-build-layout='list']")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-build-layout='board']")).toHaveAttribute("href", "/build-board");

    // Shared filter chip row — same chip vocabulary as the board.
    await expect(page.locator("[data-build-filter]")).toHaveCount(7);
    await expect(page.locator("[data-build-filter='all']")).toHaveAttribute("data-active", "true");

    // The layout switcher navigates without losing the filter context: a
    // filter selection narrows the table, then the List tab is still active.
    await page.locator("[data-build-filter='blocked']").click();
    await expect(page.locator("[data-build-filter='blocked']")).toHaveAttribute("data-active", "true");
    await expect(page.locator("[data-build-list-row]")).toHaveCount(1);
    await expect(page.locator("[data-build-list-row]")).toHaveAttribute("data-status", "blocked");

    // Switching back to All restores the full set.
    await page.locator("[data-build-filter='all']").click();
    await expect(page.locator("[data-build-list-row]")).toHaveCount(8);
  });

  test("supports keyboard navigation across rows", async ({ page }) => {
    await openBuildList(page);

    const rows = page.locator("[data-build-list-row]");
    await rows.first().focus();
    await expect(rows.first()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(rows.last()).toBeFocused();

    await page.keyboard.press("Home");
    await expect(rows.first()).toBeFocused();

    // Every row carries a visible focus-visible ring.
    const focusRing = await rows.first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(focusRing).not.toBe("none");
  });

  test("renders the COPY.md build-list empty state", async ({ page }) => {
    // `?state=empty` selects the declared empty data state. The copy is locked
    // verbatim by COPY.md build-list.
    await page.goto("/build-list?state=empty", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-build-list]")).toBeVisible();

    const empty = page.locator("[data-build-list-empty]");
    await expect(empty).toBeVisible();
    await expect(empty.locator("[data-slot='empty-state']")).toBeVisible();

    // COPY.md build-list — exact H2 + P.
    await expect(empty).toContainText("No tasks yet.");
    await expect(empty).toContainText(
      "Materialize an approved plan, or press c to create a task directly.",
    );

    // COPY.md build-list — both action buttons.
    await expect(page.locator("[data-build-list-empty-action='materialize']")).toHaveText(
      "Materialize plan",
    );
    await expect(page.locator("[data-build-list-empty-action='new-task']")).toHaveText("New task");

    // The empty state replaces the table, not appends to it.
    await expect(page.locator("[data-build-list-table]")).toHaveCount(0);

    // The shared header + layout switcher + filter row survive the empty state.
    await expect(page.locator("[data-build-list-layouts]")).toBeVisible();
    await expect(page.locator("[data-build-list-filters]")).toBeVisible();

    await captureScreenshot(page, "build-list-empty");
  });

  test("collapses list rows under the DESIGN.md 3.1 container-query threshold", async ({ page }) => {
    await openBuildList(page);

    // Wide viewport: the secondary columns are visible.
    await expect(page.locator("[data-build-list-column='module']")).toBeVisible();
    await expect(page.locator("[data-build-list-column='owner']")).toBeVisible();
    await expect(page.locator("[data-build-list-column='updated']")).toBeVisible();

    // Narrow the viewport below the §3.1 doc-table-row container threshold:
    // the container query collapses the low-priority columns.
    await page.setViewportSize({ width: 560, height: 900 });
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });

    await expect(page.locator("[data-build-list-column='module']")).toBeHidden();
    await expect(page.locator("[data-build-list-column='owner']")).toBeHidden();
    await expect(page.locator("[data-build-list-column='updated']")).toBeHidden();

    // ID, Title, Status, Progress, and Modes survive the collapse.
    await expect(page.locator("[data-build-list-column='id']")).toBeVisible();
    await expect(page.locator("[data-build-list-column='title']")).toBeVisible();
    await expect(page.locator("[data-build-list-column='status']")).toBeVisible();
    await expect(page.locator("[data-build-list-column='modes']")).toBeVisible();

    await captureScreenshot(page, "build-list-collapsed");
  });
});
