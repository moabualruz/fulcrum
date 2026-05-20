import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for the Review queue route — OD
 * `review-queue.html` (`prd-web-review-queue-od-fidelity`).
 *
 * Every assertion drives the production `/review` route in a real browser; no
 * source-string assertions. The spec proves the six required visual-PRD
 * acceptance groups:
 *
 *  - **layout** — page head + count, the four-tab lifecycle strip with count
 *    pills, the `pr-row` grid (PR icon, title + diff desc, four-dot check-row,
 *    stacked reviewer avatars, status badge, relative age, compact mode row);
 *  - **data-states** — `populated` (rows render) and `empty` (the COPY.md
 *    review-queue empty state);
 *  - **interactions** — selecting a lifecycle tab regroups the queue; the
 *    per-row mode row exposes the canonical Manual/Play/Discuss/AI Assist set;
 *  - **copy** — the empty-state H2 + body match COPY.md review-queue verbatim;
 *    tab labels and row badges use the canonical COPY.md §362 8-state vocab;
 *  - **parity** — the re-homed `review-search` kind + author filters still
 *    narrow the queue (no feature loss);
 *  - **accessibility** — `role="tablist"`/`tab`/`tabpanel`, `aria-selected`,
 *    a visible `focus-visible` ring, and a forced-colors render.
 *
 * Source: OD `review-queue.html`; IA-MAP.md §2.4; CLI-TUI-UX.md §478;
 * COPY.md §362 + review-queue empty state; DESIGN.md §4.11 mode row.
 * States: `populated`, `empty`.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("review queue — OD review-queue.html fidelity", () => {
	test("renders the page head, four-tab lifecycle strip, and pr-row grid", async ({ page }) => {
		await page.goto("/review");

		// layout — page head + OD count line.
		const queue = page.locator("[data-review-queue]");
		await expect(queue).toBeVisible();
		await expect(queue).toHaveAttribute("data-state", "populated");
		await expect(page.locator("[data-review-queue-head] h1")).toHaveText("Review queue");
		await expect(page.locator("[data-review-queue-count]")).toContainText("awaiting review");
		await expect(page.locator("[data-review-queue-count]")).toContainText("merged today");

		// layout — four-tab lifecycle strip with count pills (CLI-TUI-UX §478).
		const tabs = page.locator("[data-review-queue-tabs] [data-review-tab]");
		await expect(tabs).toHaveCount(4);
		await expect(page.locator("[data-review-tab='awaiting']")).toContainText("Awaiting review");
		await expect(page.locator("[data-review-tab='changes']")).toContainText("Changes requested");
		await expect(page.locator("[data-review-tab='approved']")).toContainText("Approved");
		await expect(page.locator("[data-review-tab='merged']")).toContainText("Merged today");
		await expect(page.locator("[data-review-tab-count='awaiting']")).toHaveText("3");
		await expect(page.locator("[data-review-tab-count='merged']")).toHaveText("2");

		// layout — pr-row grid: every region OD `review-queue.html` ships.
		const rows = page.locator("[data-review-queue-rows] [data-review-row]");
		await expect(rows).toHaveCount(3);
		const firstRow = page.locator("[data-review-row='FUL-1284']");
		await expect(firstRow.locator("[data-review-row-icon]")).toBeVisible();
		await expect(firstRow.locator("[data-review-row-title]")).toHaveText(
			"Rework token refresh for offline mode",
		);
		await expect(firstRow.locator("[data-review-row-desc]")).toContainText("FUL-1284");
		await expect(firstRow.locator("[data-review-row-desc]")).toContainText("14 files changed");
		await expect(firstRow.locator("[data-review-row-checks] [data-review-check]")).toHaveCount(4);
		await expect(
			firstRow.locator("[data-review-check][data-review-check-tone='warn']"),
		).toHaveCount(1);
		await expect(firstRow.locator("[data-review-row-reviewers] [data-slot='avatar']")).toHaveCount(2);
		await expect(firstRow.locator("[data-review-row-age]")).toHaveText("5m ago");
	});

	test("tab labels and row badges use the canonical COPY.md §362 status vocab", async ({ page }) => {
		await page.goto("/review");

		// copy — awaiting maps to the canonical `waiting-input` status.
		const awaitingBadge = page
			.locator("[data-review-row='FUL-1284'] [data-review-row-status]")
			.first();
		await expect(awaitingBadge).toHaveAttribute("data-status", "waiting-input");
		await expect(awaitingBadge).toContainText("Waiting input");

		// copy — each lifecycle tab's rows carry its canonical status.
		await page.locator("[data-review-tab='changes']").click();
		await expect(
			page.locator("[data-review-row='FUL-1279'] [data-review-row-status]"),
		).toHaveAttribute("data-status", "blocked");

		await page.locator("[data-review-tab='approved']").click();
		await expect(
			page.locator("[data-review-row='FUL-1276'] [data-review-row-status]"),
		).toHaveAttribute("data-status", "passing");

		await page.locator("[data-review-tab='merged']").click();
		await expect(
			page.locator("[data-review-row='FUL-1274'] [data-review-row-status]"),
		).toHaveAttribute("data-status", "completed");

		// copy — no banned non-canonical synonym appears anywhere.
		for (const banned of ["In Flight", "WIP", "Doing", "Stuck", "Done!"]) {
			await expect(page.locator("[data-review-queue]")).not.toContainText(banned);
		}
	});

	test("selecting a lifecycle tab regroups the queue by lifecycle state", async ({ page }) => {
		await page.goto("/review");

		// interaction — awaiting tab is active by default.
		await expect(page.locator("[data-review-tab='awaiting']")).toHaveAttribute(
			"data-active",
			"true",
		);
		await expect(page.locator("[data-review-queue-rows] [data-review-row]")).toHaveCount(3);

		// interaction — selecting `changes` regroups to the 2 changes-requested PRs.
		await page.locator("[data-review-tab='changes']").click();
		await expect(page.locator("[data-review-tab='changes']")).toHaveAttribute(
			"data-active",
			"true",
		);
		const changesRows = page.locator("[data-review-queue-rows] [data-review-row]");
		await expect(changesRows).toHaveCount(2);
		for (const handle of await changesRows.all()) {
			await expect(handle).toHaveAttribute("data-review-lifecycle", "changes");
		}

		// interaction — `merged` rows render with the muted/merged treatment.
		await page.locator("[data-review-tab='merged']").click();
		await expect(page.locator("[data-review-queue-rows] [data-review-row]")).toHaveCount(2);
	});

	test("per-row mode row exposes the canonical Manual/Play/Discuss/AI Assist set", async ({
		page,
	}) => {
		await page.goto("/review");

		// interaction — every review row is a Step with a mode affordance (DESIGN §4.11).
		const firstRow = page.locator("[data-review-row='FUL-1284']");
		await expect(firstRow).toHaveAttribute("data-mode-affordance", "step");
		await expect(firstRow).toHaveAttribute("data-mode-step-kind", "review-item");

		const modeRow = firstRow.locator("[data-review-row-mode][data-slot='mode-row']");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		const modeButtons = modeRow.locator("[data-slot='mode-row-option']");
		await expect(modeButtons).toHaveCount(4);
		await expect(modeRow.locator("[data-mode='manual']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='play']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='discuss']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='assist']")).toBeVisible();

		// interaction — AI Assist dispatches the one shell drawer event.
		const assistEvent = page.evaluate(
			() =>
				new Promise<boolean>((resolve) => {
					window.addEventListener("fulcrum:open-ai-assist", () => resolve(true), { once: true });
					setTimeout(() => resolve(false), 2000);
				}),
		);
		await modeRow.locator("[data-mode='assist']").click();
		expect(await assistEvent).toBe(true);
	});

	test("empty state matches COPY.md review-queue when a tab has no rows", async ({ page }) => {
		await page.goto("/review");

		// data-state — narrow the awaiting tab to a kind with no rows → empty.
		await page.locator("[data-review-filter-kind]").selectOption("annotation");
		const queue = page.locator("[data-review-queue]");
		await expect(queue).toHaveAttribute("data-state", "empty");

		// copy — empty-state H2 + body match COPY.md review-queue verbatim.
		const empty = page.locator("[data-review-queue-empty]");
		await expect(empty).toBeVisible();
		await expect(empty.locator("[data-slot='empty-state-title']")).toHaveText(
			"No reviews waiting.",
		);
		await expect(empty.locator("[data-slot='empty-state-description']")).toHaveText(
			"Items appear here when a task moves to in-review. Push something forward.",
		);
		await expect(page.locator("[data-review-empty-board]")).toHaveText("Open board");
		await expect(page.locator("[data-review-empty-board]")).toHaveAttribute(
			"href",
			"/build-board",
		);
		await expect(page.locator("[data-review-empty-completed]")).toHaveText("View completed");

		// interaction — `View completed` jumps to the merged tab, repopulating.
		await page.locator("[data-review-empty-completed]").click();
		await expect(page.locator("[data-review-tab='merged']")).toHaveAttribute(
			"data-active",
			"true",
		);
	});

	test("re-homed review-search kind + author filters still narrow the queue", async ({ page }) => {
		await page.goto("/review");

		// parity — the changes tab has a `plan` PR and a `prototype` PR.
		await page.locator("[data-review-tab='changes']").click();
		await expect(page.locator("[data-review-queue-rows] [data-review-row]")).toHaveCount(2);

		// parity — the kind filter (re-homed from review-search) narrows by kind.
		await page.locator("[data-review-filter-kind]").selectOption("plan");
		await expect(page.locator("[data-review-queue-rows] [data-review-row]")).toHaveCount(1);
		await expect(page.locator("[data-review-row='FUL-1279']")).toBeVisible();

		// parity — the author filter (re-homed from review-search) narrows by author.
		await page.locator("[data-review-filter-kind]").selectOption("all");
		await page.locator("[data-review-filter-author]").fill("carol");
		await expect(page.locator("[data-review-queue-rows] [data-review-row]")).toHaveCount(1);
		await expect(page.locator("[data-review-row='FUL-1277']")).toBeVisible();
	});

	test("queue tabs are keyboard operable with a visible focus ring", async ({ page }) => {
		await page.goto("/review");

		// accessibility — tablist / tab / tabpanel roles and aria-selected.
		await expect(page.locator("[data-review-queue-tabs]")).toHaveAttribute("role", "tablist");
		const awaitingTab = page.locator("[data-review-tab='awaiting']");
		await expect(awaitingTab).toHaveAttribute("role", "tab");
		await expect(awaitingTab).toHaveAttribute("aria-selected", "true");
		await expect(page.locator("[data-review-tab='changes']")).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(page.locator("[data-review-queue-rows]")).toHaveAttribute("role", "tabpanel");

		// accessibility — the active tab is keyboard-focusable and shows a ring.
		await awaitingTab.focus();
		await expect(awaitingTab).toBeFocused();
		const ring = await awaitingTab.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(ring).not.toBe("none");

		// accessibility — Enter activates the focused tab.
		await page.locator("[data-review-tab='approved']").focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-review-tab='approved']")).toHaveAttribute(
			"data-active",
			"true",
		);
	});

	test("renders under forced-colors and captures OD-fidelity evidence", async ({ page }) => {
		// accessibility — forced-colors render must not collapse the queue.
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/review");
		await expect(page.locator("[data-review-queue]")).toBeVisible();
		await expect(page.locator("[data-review-queue-tabs] [data-review-tab]")).toHaveCount(4);
		await page.emulateMedia({ forcedColors: null });

		// evidence — rendered populated + empty screenshots for the PRD record.
		await page.goto("/review");
		await expect(page.locator("[data-review-queue]")).toHaveAttribute("data-state", "populated");
		await writeEvidenceShot(
			"review-queue-populated.png",
			await page.screenshot({ fullPage: true }),
		);

		await page.locator("[data-review-filter-kind]").selectOption("annotation");
		await expect(page.locator("[data-review-queue]")).toHaveAttribute("data-state", "empty");
		await writeEvidenceShot("review-queue-empty.png", await page.screenshot({ fullPage: true }));
	});
});
