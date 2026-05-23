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
 * Design-e2e fidelity coverage for the OD `ship-archive.html` surface — the
 * Ship release-archive timeline (IA-MAP.md §2.5 Ship, CLI-TUI-UX.md §484
 * `:archive`, COPY.md §72 ship-archive empty state, DESIGN.md §4.11 per-step
 * mode affordance row).
 *
 * The route renders a chronological release log: a `.page-head` with title and
 * a mono release count, then a vertical timeline of date-bucket groups — each
 * a date rail plus a stack of release cards. Every release card carries a
 * semver pill (maj / min / patch variants), a one-line description, a
 * monospace meta row (commit · PRs · LOC · authors), and a compact ModeRow.
 *
 * Route-name history: `ship-archive` was a mislabelled route rendering an
 * account-deletion page; `prd-cross-mislabeled-route-content-migration`
 * preserved that content and this PRD reclaims the name for the OD archive.
 *
 * Declared states (PRD `states`): populated · empty.
 */

test.describe("Ship release archive", () => {
  test("renders the OD page head: title and the mono release count", async ({ page }) => {
    await page.goto("/ship-archive");

    await expect(page.locator("[data-route='ws-stage'][data-stage='ship']")).toBeVisible();
    await expect(page.locator("[data-view='ship-archive']")).toBeVisible();

    const head = page.locator("[data-ship-archive-head]");
    await expect(head).toBeVisible();
    await expect(head).toContainText("Ship archive");
    // OD `.count` mono sub-line — total releases over the trailing window.
    await expect(page.locator("[data-ship-archive-count]")).toContainText("releases");
    await expect(page.locator("[data-ship-archive-count]")).toContainText("last 90 days");
  });

  test("renders a vertical timeline of date-bucket groups, each a date rail plus a card stack", async ({
    page,
  }) => {
    await page.goto("/ship-archive");

    const timeline = page.locator("[data-ship-archive-timeline]");
    await expect(timeline).toBeVisible();

    // OD `.tl` — five `.tl-bucket` date groups in the fixture projection.
    const buckets = page.locator("[data-ship-archive-bucket]");
    await expect(buckets).toHaveCount(5);

    // Each bucket has a date rail (OD `.date`) and a release-card stack
    // (OD `.stack`).
    const first = buckets.first();
    await expect(first.locator("[data-ship-archive-date]")).toContainText("Mar 21");
    await expect(first.locator("[data-ship-archive-date]")).toContainText("today");
    await expect(first.locator("[data-ship-archive-stack]")).toBeVisible();

    // The timeline is a stack of release cards across the buckets.
    await expect(page.locator("[data-ship-archive-release]")).toHaveCount(6);
  });

  test("each release card carries a semver pill, description, mono meta row, and a mode row", async ({
    page,
  }) => {
    await page.goto("/ship-archive");

    const card = page.locator("[data-ship-archive-release]").first();
    await expect(card).toBeVisible();

    // Semver pill (OD `.tag-pill`) — the top release is a minor bump.
    const pill = card.locator("[data-ship-archive-semver]");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("v0.18.0");
    await expect(pill).toHaveAttribute("data-ship-archive-semver", "min");
    // The card mirrors the pill's classification on its own `data-semver`.
    await expect(card).toHaveAttribute("data-semver", "min");

    // One-line OD `.desc`.
    await expect(card.locator("[data-ship-archive-desc]")).toContainText("trace");

    // Monospace OD `.meta` row — commit / PRs / LOC / authors.
    const meta = card.locator("[data-ship-archive-meta]");
    await expect(meta.locator("[data-ship-archive-commit]")).toContainText("commit a3f29b1");
    await expect(meta.locator("[data-ship-archive-prs]")).toContainText("14 PRs merged");
    await expect(meta.locator("[data-ship-archive-loc]")).toContainText("1284 LOC");
    await expect(meta.locator("[data-ship-archive-authors]")).toContainText("mkh, sarah");

    // Compact ModeRow per card (DESIGN.md §4.11 — the release card is a Step).
    await expect(card.locator("[data-slot='mode-row']")).toBeVisible();
  });

  test("semver pill variant reflects the maj / min / patch classification", async ({ page }) => {
    await page.goto("/ship-archive");

    // The fixture archive spans a major (v0.17.0), several minors, and a
    // patch (v0.17.4) — the pill variant is derived from the version delta to
    // the next-older release, so all three classes appear.
    await expect(
      page.locator("[data-ship-archive-release][data-semver='maj']"),
    ).toHaveCount(1);
    await expect(
      page.locator("[data-ship-archive-release][data-semver='patch']"),
    ).toHaveCount(1);
    const minorCount = await page
      .locator("[data-ship-archive-release][data-semver='min']")
      .count();
    expect(minorCount).toBeGreaterThanOrEqual(1);

    // The patch release is the v0.17.4 hotfix.
    const patch = page.locator("[data-ship-archive-release][data-semver='patch']");
    await expect(patch.locator("[data-ship-archive-semver]")).toContainText("v0.17.4");

    // The major release is v0.17.0.
    const major = page.locator("[data-ship-archive-release][data-semver='maj']");
    await expect(major.locator("[data-ship-archive-semver]")).toContainText("v0.17.0");
  });

  test("empty state matches the COPY.md §72 ship-archive template", async ({ page }) => {
    await page.goto("/ship-archive?state=empty");

    // The `data-empty-for` slot contract is preserved for design-e2e.
    const empty = page.locator("[data-empty-for='ship-archive']");
    await expect(empty).toBeVisible();
    // COPY.md §72 — reconciled from the divergent OD `No releases yet.` copy.
    await expect(empty).toContainText("No releases shipped.");
    await expect(empty).toContainText(
      "Approved reviews send artifacts here. Cut a release once review is green.",
    );

    // COPY.md §72 actions.
    await expect(empty.getByRole("link", { name: /Open Ship/ })).toBeVisible();
    await expect(empty.getByText("View artifacts")).toBeVisible();

    // No timeline buckets when the archive is empty.
    await expect(page.locator("[data-ship-archive-bucket]")).toHaveCount(0);
  });

  test("forced-colors: the release archive stays operable in high-contrast", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/ship-archive");

    await expect(page.locator("[data-route='ws-stage']")).toBeVisible();
    await expect(page.locator("[data-ship-archive-timeline]")).toBeVisible();
    await expect(page.locator("[data-ship-archive-release]").first()).toBeVisible();
    await writeEvidenceShot(
      "ship-archive-forced-colors.png",
      await page.screenshot({ fullPage: true }),
    );
  });

  test("captures rendered evidence of the populated and empty states", async ({ page }) => {
    // Populated release timeline.
    await page.goto("/ship-archive");
    await expect(page.locator("[data-ship-archive-timeline]")).toBeVisible();
    await writeEvidenceShot(
      "ship-archive-populated.png",
      await page.screenshot({ fullPage: true }),
    );

    // COPY.md §72 empty state.
    await page.goto("/ship-archive?state=empty");
    await expect(page.locator("[data-empty-for='ship-archive']")).toBeVisible();
    await writeEvidenceShot(
      "ship-archive-empty.png",
      await page.screenshot({ fullPage: true }),
    );

    // Mobile timeline — no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ship-archive");
    await expect(page.locator("[data-ship-archive-timeline]")).toBeVisible();
    const overflow = await page
      .locator("[data-route='ws-stage']")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await writeEvidenceShot(
      "ship-archive-mobile.png",
      await page.screenshot({ fullPage: true }),
    );
  });
});
