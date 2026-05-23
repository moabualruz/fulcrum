import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { captureScreenshot } from "../../scripts/run-design-e2e";

/**
 * Rendered OD-fidelity coverage for `prd-web-operate-alerts-console-od-fidelity`.
 *
 * Drives the production route `/operate-alerts` and asserts it matches the OD
 * `operate-alerts.html` view: a bounded (max-width 1180px) Alerts console with
 * a page head carrying a count line, `Notification rules` + `New rule`
 * actions, a four-tab severity strip (Firing / Awaiting ack / Resolved /
 * Silenced) with count pills, alert rows with a pulsing `crit` severity dot,
 * a title + mono threshold/`rule_id` desc, a `DESIGN.md §4.9` status badge on
 * the canonical 8-state vocabulary, a trace id + relative time, a lifecycle
 * state, and a `DESIGN.md §4.11` compact mode row. Resolved rows dim; the
 * empty state uses the locked `COPY.md` operate-alerts strings; the error
 * state renders the alert-evaluator failure banner.
 *
 * The route was previously a mislabeled login-sessions table — this spec also
 * proves the OD Alerts console fully replaced it (no `Login sessions` heading,
 * no `data-operate-alerts-count` / `data-revoke-other-sessions` session hooks).
 */

async function openAlerts(page: Page, query = ""): Promise<void> {
  await page.goto(`/operate-alerts${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-operate-alerts]")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test.describe("operate alerts console OD fidelity", () => {
  test("renders the page head, count line, and the two head actions", async ({ page }) => {
    await openAlerts(page);

    await expect(page.locator("[data-operate-alerts-header]")).toHaveText("Alerts");
    // The mislabeled login-sessions surface is gone — the title is the OD one.
    await expect(page).toHaveTitle(/Operate · Alerts/);
    await expect(page.locator("[data-operate-alerts-header]")).not.toHaveText("Login sessions");

    // OD head count line — `N firing · N awaiting ack · N resolved today`.
    const count = page.locator("[data-alerts-count]");
    await expect(count).toContainText("2 firing");
    await expect(count).toContainText("1 awaiting ack");
    await expect(count).toContainText("2 resolved today");

    await expect(page.locator("[data-alerts-notification-rules]")).toHaveText("Notification rules");
    await expect(page.locator("[data-alerts-new-rule]")).toHaveText("New rule");

    // The bounded OD `page` width — max-width 1180px.
    const maxWidth = await page
      .locator("[data-operate-alerts]")
      .evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).toBe("1180px");
  });

  test("renders the four-tab severity strip with count pills", async ({ page }) => {
    await openAlerts(page);

    const tabs = page.locator("[data-alerts-tab]");
    await expect(tabs).toHaveCount(4);
    await expect(tabs).toHaveText([
      /Firing/,
      /Awaiting ack/,
      /Resolved/,
      /Silenced/,
    ]);

    // The tab strip is a real ARIA tablist.
    await expect(page.locator("[data-alerts-tabs]")).toHaveAttribute("role", "tablist");
    await expect(page.locator("[data-alerts-tab='firing']")).toHaveAttribute("role", "tab");

    // Firing is the default-selected lane.
    await expect(page.locator("[data-alerts-tab='firing']")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-alerts-tab='firing']")).toHaveAttribute("data-active", "true");

    // Count pills reflect the per-lane alert count.
    await expect(page.locator("[data-alerts-tab-count='firing']")).toHaveText("2");
    await expect(page.locator("[data-alerts-tab-count='awaiting-ack']")).toHaveText("1");
    await expect(page.locator("[data-alerts-tab-count='resolved']")).toHaveText("2");
    await expect(page.locator("[data-alerts-tab-count='silenced']")).toHaveText("0");
  });

  test("renders alert rows with severity dot, desc, status badge, trace, lifecycle, and mode row", async ({ page }) => {
    await openAlerts(page);

    const rows = page.locator("[data-alert-row]");
    await expect(rows).toHaveCount(2);

    const firstRow = page.locator("[data-alert-row='alr_a8c92']");
    await expect(firstRow).toBeVisible();

    // OD pulsing critical severity dot. Svelte scopes the keyframe name with a
    // per-component hash prefix (`svelte-xxxxxx-alert-sev-pulse`).
    const dot = firstRow.locator("[data-alert-sev-dot='crit']");
    await expect(dot).toBeVisible();
    const dotAnimation = await dot.evaluate((el) => getComputedStyle(el).animationName);
    expect(dotAnimation).toMatch(/alert-sev-pulse$/);
    expect(dotAnimation).not.toBe("none");

    // Title + mono threshold/rule_id desc.
    await expect(firstRow.locator("[data-alert-title]")).toHaveText(
      "MCP server context-mode latency > 5s",
    );
    const desc = firstRow.locator("[data-alert-desc]");
    await expect(desc).toContainText("p99 6.4s for last 5m · threshold 5s");
    await expect(desc).toContainText("rule_id alr_a8c92");
    const descFont = await desc.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(descFont.toLowerCase()).toMatch(/mono|fira/);

    // DESIGN.md §4.9 status badge — color + glyph + text, never color alone.
    const badge = firstRow.locator("[data-slot='status-badge']");
    await expect(badge).toHaveAttribute("data-status", "failing");
    await expect(badge.locator("[data-status-glyph]")).toBeVisible();
    await expect(firstRow.locator("[data-alert-status-label='alr_a8c92']")).toHaveText("failing");

    // Trace id + relative time + lifecycle state.
    await expect(firstRow.locator("[data-alert-trace='alr_a8c92']")).toHaveText("tr_b41c92e");
    await expect(firstRow.locator("[data-alert-age='alr_a8c92']")).toHaveText("3m ago");
    await expect(firstRow.locator("[data-alert-lifecycle='alr_a8c92']")).toHaveText("ongoing");

    // DESIGN.md §4.11 compact mode row — a single role="toolbar" group per row.
    const modeRow = firstRow.locator("[data-alert-mode-row='alr_a8c92']");
    await expect(modeRow).toHaveAttribute("role", "toolbar");
    await expect(modeRow).toHaveAttribute("data-density", "compact");
    await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
    await expect(modeRow.locator("[data-mode='assist']")).toBeVisible();

    await captureScreenshot(page, "operate-alerts-populated");
  });

  test("regroups the alert list when a severity tab is selected", async ({ page }) => {
    await openAlerts(page);

    // Firing lane: two critical alerts.
    await expect(page.locator("[data-alert-row]")).toHaveCount(2);

    // Select the Resolved tab — the list regroups to the resolved lane.
    await page.locator("[data-alerts-tab='resolved']").click();
    await expect(page.locator("[data-alerts-tab='resolved']")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-alerts-tab='firing']")).toHaveAttribute("aria-selected", "false");
    await expect(page.locator("[data-alert-row]")).toHaveCount(2);
    await expect(page.locator("[data-alert-row='alr_3082c']")).toBeVisible();

    // Resolved rows dim — OD `opacity: 0.6`.
    await expect(page.locator("[data-alert-row='alr_3082c']")).toHaveAttribute("data-closed", "true");
    const opacity = await page
      .locator("[data-alert-row='alr_3082c']")
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeCloseTo(0.6, 1);

    // Silenced lane is empty — the lane-empty note shows, no rows.
    await page.locator("[data-alerts-tab='silenced']").click();
    await expect(page.locator("[data-alert-row]")).toHaveCount(0);
    await expect(page.locator("[data-alerts-lane-empty]")).toBeVisible();
  });

  test("acknowledges and resolves alerts through the lifecycle", async ({ page }) => {
    await openAlerts(page);

    // Acknowledge a firing alert — it leaves Firing for Awaiting ack.
    await page.locator("[data-alert-acknowledge='alr_a8c92']").click();
    await expect(page.locator("[data-alerts-tab-count='firing']")).toHaveText("1");
    await expect(page.locator("[data-alerts-tab-count='awaiting-ack']")).toHaveText("2");

    // Switch to Awaiting ack — the acknowledged alert is there, in waiting-input.
    await page.locator("[data-alerts-tab='awaiting-ack']").click();
    const acked = page.locator("[data-alert-row='alr_a8c92']");
    await expect(acked).toHaveAttribute("data-status", "waiting-input");
    await expect(page.locator("[data-alert-lifecycle='alr_a8c92']")).toHaveText("ack pending");

    // Resolve it — it moves to the Resolved lane in the completed state.
    await page.locator("[data-alert-resolve='alr_a8c92']").click();
    await expect(page.locator("[data-alerts-tab-count='resolved']")).toHaveText("3");
    await page.locator("[data-alerts-tab='resolved']").click();
    await expect(page.locator("[data-alert-row='alr_a8c92']")).toHaveAttribute(
      "data-status",
      "completed",
    );
  });

  test("renders the COPY.md operate-alerts empty state", async ({ page }) => {
    // `?state=empty` selects the declared quiet zero-alerts data state.
    await openAlerts(page, "?state=empty");

    const empty = page.locator("[data-alerts-empty]");
    await expect(empty).toBeVisible();
    await expect(empty.locator("[data-slot='empty-state']")).toBeVisible();

    // COPY.md operate-alerts — exact H2 + P, NOT the divergent OD copy.
    await expect(empty).toContainText("No alerts firing.");
    await expect(empty).toContainText(
      "Doctor is quiet. Re-probe to refresh, or open telemetry for trends.",
    );
    // The divergent OD `empty-state` body must not leak through.
    await expect(empty).not.toContainText("Alert rules emit here when thresholds breach");

    // COPY.md operate-alerts — both action buttons.
    await expect(page.locator("[data-alerts-empty-action='re-probe']")).toHaveText("Re-probe");
    await expect(page.locator("[data-alerts-empty-action='open-telemetry']")).toHaveText(
      "Open telemetry",
    );

    // The empty state replaces the alert list, not appends to it.
    await expect(page.locator("[data-alerts-rows]")).toHaveCount(0);
    // The head + tab strip survive the empty state.
    await expect(page.locator("[data-alerts-head]")).toBeVisible();
    await expect(page.locator("[data-alerts-tabs]")).toBeVisible();

    await captureScreenshot(page, "operate-alerts-empty");
  });

  test("renders the alert-evaluator error state", async ({ page }) => {
    // `?state=error` selects the declared error data state.
    await openAlerts(page, "?state=error");

    await expect(page.locator("[data-operate-alerts]")).toHaveAttribute("data-state", "error");

    const banner = page.locator("[data-alerts-error]");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Alert rule evaluation failed");
    // DESIGN.md §13 error-copy template — the exact next step + a trace id.
    await expect(banner).toContainText("Re-probe to refresh, or open telemetry for trends");
    await expect(banner).toContainText("tr_b41c92e");

    await captureScreenshot(page, "operate-alerts-error");
  });

  test("supports keyboard navigation across the severity tabs", async ({ page }) => {
    await openAlerts(page);

    await page.locator("[data-alerts-tab='firing']").focus();
    await expect(page.locator("[data-alerts-tab='firing']")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("[data-alerts-tab='awaiting-ack']")).toBeFocused();

    // The focused tab activates on Enter and regroups the list.
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-alerts-tab='awaiting-ack']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-alert-row='alr_71e09']")).toBeVisible();

    // Every tab carries a visible focus-visible ring.
    const focusRing = await page
      .locator("[data-alerts-tab='awaiting-ack']")
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(focusRing).not.toBe("none");
  });
});
