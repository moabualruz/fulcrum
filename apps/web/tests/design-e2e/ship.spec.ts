import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
  const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), body);
}

/**
 * Design-e2e fidelity coverage for the OD `ship.html` surface — the Ship stage
 * workbench (IA-MAP.md §2.5 Ship, DESIGN.md §197 peek-overview, DESIGN.md §356
 * mode affordances, COPY.md §129 Ship empty state, COPY.md §4 confirmation
 * tiers).
 *
 * The route renders the release-management workbench: a toolbar (stage title,
 * Channel / Sort / Filter segmented group, `Cut release` primary with the
 * `⌘R` kbd hint) over a release table, plus the right-anchored peek-overview
 * detail panel opened on row click without a route change. The legacy
 * `/artifacts` generic file manager is re-homed here with a 301 redirect.
 *
 * Declared states (PRD `states`): populated · empty · mobile · forced-colors.
 */

test.describe("Ship stage workbench", () => {
  test("renders the OD toolbar: title, sub-line, Channel/Sort/Filter group, Cut release", async ({
    page,
  }) => {
    await page.goto("/ship");

    await expect(page.locator("[data-route='ws-stage'][data-stage='ship']")).toBeVisible();
    const toolbar = page.locator("[data-ship-toolbar]");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText("Artifacts");
    await expect(page.locator("[data-ship-subline]")).toContainText("7 releases");
    await expect(page.locator("[data-ship-subline]")).toContainText("1 in flight");

    // Segmented Channel / Sort / Filter group (OD `.group`).
    const group = page.locator("[data-ship-filter-group]");
    await expect(group.locator("[data-ship-channel-filter]")).toContainText("Channel");
    await expect(group.locator("[data-ship-channel-filter]")).toContainText("stable");
    await expect(group.locator("[data-ship-sort]")).toContainText("Newest");
    await expect(group.locator("[data-ship-filter]")).toContainText("Filter");

    // `Cut release` primary action carries the `⌘R` keyboard hint.
    const cut = page.locator("[data-ship-cut-release]");
    await expect(cut).toContainText("Cut release");
    await expect(page.locator("[data-ship-cut-release-kbd]")).toContainText("⌘R");
  });

  test("renders the release table with the OD ten columns and the in-flight ribbon", async ({
    page,
  }) => {
    await page.goto("/ship");

    const headers = page.locator("[data-ship-release-table] thead th");
    // ribbon column + the nine labelled columns.
    await expect(headers).toHaveCount(10);
    // Header labels render `text-transform: uppercase` via CSS — compare
    // case-insensitively against the OD column vocabulary.
    const labels = (await headers.allInnerTexts()).join(" ").toLowerCase();
    expect(labels).toContain("artifact");
    expect(labels).toContain("channel");
    expect(labels).toContain("checks");
    expect(labels).toContain("promoted");
    expect(labels).toContain("modes");

    const rows = page.locator("[data-ship-release-row]");
    await expect(rows).toHaveCount(7);

    // First row: in-flight ribbon, aria-current focused, status badge + desc,
    // checks chips, provenance author, trace, and the four-mode ModeRow.
    const first = rows.first();
    await expect(first).toHaveAttribute("aria-current", "true");
    await expect(first).toHaveAttribute("data-channel", "stable");
    await expect(first.locator("[data-ship-ribbon]")).toBeVisible();
    await expect(first.locator("[data-slot='status-badge']")).toBeVisible();
    await expect(first.locator("[data-ship-status-desc]")).toContainText("rolling out");
    await expect(first.locator("[data-ship-checks-ok]")).toContainText("12");
    await expect(first.locator("[data-ship-checks-fail]")).toContainText("1");
    await expect(first.locator("[data-ship-author]")).toContainText("agent gemini-3-pro");
    await expect(first.locator("[data-slot='mode-row']")).toBeVisible();
  });

  test("row click opens the peek-overview panel without a route change", async ({ page }) => {
    await page.goto("/ship");

    await expect(page.locator("[data-ship-peek]")).toHaveCount(0);
    await page.locator("[data-ship-release-row]").first().click();

    // DESIGN.md §197 — peek slides over; the URL never changes.
    await expect(page).toHaveURL(/\/ship$/);
    const peek = page.locator("[data-ship-peek]");
    await expect(peek).toBeVisible();
    await expect(peek).toHaveAttribute("role", "dialog");
    await expect(peek).toHaveAttribute("aria-modal", "true");

    // Four peek sections: Release / Checks / Includes / Timeline.
    await expect(peek.locator("[data-ship-peek-section='release']")).toContainText("rollout");
    await expect(peek.locator("[data-ship-peek-section='checks']")).toBeVisible();
    await expect(peek.locator("[data-ship-peek-section='includes']")).toContainText("#4218");
    await expect(peek.locator("[data-ship-peek-section='timeline']")).toContainText("promoted");

    // Trace pill in the peek head (DESIGN.md §4.10).
    await expect(peek.locator("[data-slot='trace-chip']")).toBeVisible();

    // The action bar carries Roll back / Pause rollout / Open run feed / Promote.
    await expect(peek.locator("[data-ship-action='roll-back']")).toContainText("Roll back");
    await expect(peek.locator("[data-ship-action='pause-rollout']")).toContainText("Pause");
    await expect(peek.locator("[data-ship-action='open-run-feed']")).toContainText("run feed");
    await expect(peek.locator("[data-ship-action='promote']")).toContainText("Promote");

    // Close returns to the table with no route change.
    await page.locator("[data-ship-peek-close]").click();
    await expect(page.locator("[data-ship-peek]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/ship$/);
  });

  test("Cut release uses a COPY.md §4 inline confirmation tier", async ({ page }) => {
    await page.goto("/ship");

    await page.locator("[data-ship-cut-release]").click();
    const confirm = page.locator("[data-ship-confirm='cut-release']");
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute("data-confirm-tier", "destructive-inline");
    // No modal — the confirm is an inline step (COPY.md §4).
    await expect(page.locator("[role='dialog']")).toHaveCount(0);

    // Esc cancels the pending confirm (COPY.md §4).
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-ship-confirm='cut-release']")).toHaveCount(0);

    // Re-open and confirm — the tier resolves.
    await page.locator("[data-ship-cut-release]").click();
    await page.locator("[data-ship-confirm='cut-release'] [data-ship-confirm-yes]").click();
    await expect(page.locator("[data-ship-confirmed='cut-release']")).toHaveCount(1);
  });

  test("Roll back uses the COPY.md §4 destructive confirmation tier", async ({ page }) => {
    await page.goto("/ship");

    await page.locator("[data-ship-release-row]").first().click();
    await page.locator("[data-ship-action='roll-back']").click();

    const confirm = page.locator("[data-ship-confirm='roll-back']");
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute("data-confirm-tier", "destructive-inline");
    await expect(confirm).toContainText("Roll back");
    // Destructive tier — inline confirm, no modal (COPY.md §4 not irreversible).
    await expect(page.locator("[role='dialog'][aria-label^='Confirm']")).toHaveCount(0);

    await confirm.locator("[data-ship-confirm-yes]").click();
    await expect(page.locator("[data-ship-confirmed='roll-back']")).toHaveCount(1);
  });

  test("Mod+R cuts a release via the OD ⌘R keyboard hint", async ({ page }) => {
    await page.goto("/ship");
    await page.locator("body").click();

    await page.keyboard.press("Control+r");
    await expect(page.locator("[data-ship-confirm='cut-release']")).toBeVisible();
  });

  test("empty state matches the COPY.md §129 Ship template", async ({ page }) => {
    await page.goto("/ship?state=empty");

    const empty = page.locator("[data-ship-empty] [data-slot='empty-state']");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No artifacts yet.");
    await expect(empty).toContainText(
      "Artifacts are produced by runs in Build. Approved reviews send them here.",
    );
    // No release table when empty.
    await expect(page.locator("[data-ship-release-row]")).toHaveCount(0);
  });

  test("peek panel is a full-width sheet on mobile without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ship");

    await expect(page.locator("[data-ship-toolbar]")).toBeVisible();
    await page.locator("[data-ship-release-row]").first().click();
    const peek = page.locator("[data-ship-peek]");
    await expect(peek).toBeVisible();

    // Full-width sheet on mobile (OD `@media (max-width: 900px)`): the peek
    // fills its container — its width matches the route content width.
    const peekWidth = await peek.evaluate((el) => el.getBoundingClientRect().width);
    const routeWidth = await page
      .locator("[data-route='ws-stage']")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(peekWidth).toBeCloseTo(routeWidth, 0);

    // The route container itself never overflows the viewport horizontally.
    // (The release table is intentionally horizontally scrollable inside
    // `[data-ship-table-wrap]`, mirroring the OD `.table-wrap { overflow }`.)
    const overflow = await page
      .locator("[data-route='ws-stage']")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("forced-colors: the Ship workbench stays operable in high-contrast", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/ship");

    await expect(page.locator("[data-route='ws-stage']")).toBeVisible();
    await expect(page.locator("[data-ship-release-table]")).toBeVisible();
    await page.locator("[data-ship-release-row]").first().click();
    await expect(page.locator("[data-ship-peek]")).toBeVisible();
    await page.emulateMedia({ forcedColors: "active" });
    await writeEvidenceShot(
      "ship-stage-forced-colors.png",
      await page.screenshot({ fullPage: true }),
    );
  });

  test("captures rendered evidence of the populated, peek, and empty states", async ({ page }) => {
    // Populated release table.
    await page.goto("/ship");
    await expect(page.locator("[data-ship-release-table]")).toBeVisible();
    await writeEvidenceShot(
      "ship-stage-populated.png",
      await page.screenshot({ fullPage: true }),
    );

    // Peek-overview panel open over the table.
    await page.locator("[data-ship-release-row]").first().click();
    await expect(page.locator("[data-ship-peek]")).toBeVisible();
    await expect(page.locator("[data-ship-peek-section='timeline']")).toBeVisible();
    // Capture the viewport (not fullPage) so the absolutely-positioned peek
    // overlay is in frame.
    await writeEvidenceShot("ship-stage-peek.png", await page.screenshot());

    // COPY.md §129 empty state.
    await page.goto("/ship?state=empty");
    await expect(page.locator("[data-ship-empty]")).toBeVisible();
    await writeEvidenceShot("ship-stage-empty.png", await page.screenshot({ fullPage: true }));

    // Mobile sheet.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ship");
    await page.locator("[data-ship-release-row]").first().click();
    await expect(page.locator("[data-ship-peek]")).toBeVisible();
    await writeEvidenceShot("ship-stage-mobile.png", await page.screenshot({ fullPage: true }));
  });
});
