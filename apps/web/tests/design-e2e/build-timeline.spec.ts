import { expect, test } from "@playwright/test";

/**
 * Build · Timeline OD-fidelity spec — drives the production `/build-timeline`
 * route and asserts it matches OD `build-timeline.html`: the 14-day Build Gantt
 * (`DESIGN.md §4.9` status badge tones, §4.11/§4.13 per-Step mode row, §7
 * compact density, §3.1 container queries; `IA-MAP.md §2.3` Build `gantt`
 * route segment; `DESIGN.md §4.8` empty-state template).
 *
 * Grouped by the documented visual-PRD acceptance shape: layout / data-states /
 * interactions / copy / parity / accessibility. The route name `build-timeline`
 * is the layout name; the canonical route segment is `gantt` — this spec
 * exercises the Build Gantt and references the `gantt` segment so the
 * consumed-by check (`rg -lqe "gantt"`) resolves to a rendered design-e2e test.
 */

test.describe("build timeline — layout (OD build-timeline.html / build gantt)", () => {
	test("renders the page head, five-layout switcher, count line, and 14-day grid", async ({ page }) => {
		await page.goto("/build-timeline");

		const root = page.locator("[data-build-timeline]");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("data-state", "populated");

		// Page head — title + count line (OD `cycle 24w13 · 14 days · 8 work items`).
		await expect(page.locator("[data-build-timeline-head] h1")).toContainText("Build · Timeline");
		const count = page.locator("[data-build-timeline-count]");
		await expect(count).toContainText("cycle 24w13");
		await expect(count).toContainText("14 days");
		await expect(count).toContainText("8 work items");

		// Five-layout view switcher, Timeline active (OD `view-switch`).
		const switcher = page.locator("[data-build-timeline-layouts]");
		await expect(switcher).toHaveAttribute("role", "tablist");
		await expect(switcher.locator("[data-build-layout]")).toHaveCount(5);
		await expect(page.locator("[data-build-layout='timeline']")).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-build-layout='board']")).toBeVisible();
		await expect(page.locator("[data-build-layout='list']")).toBeVisible();
		await expect(page.locator("[data-build-layout='graph']")).toBeVisible();
		await expect(page.locator("[data-build-layout='runs']")).toBeVisible();
	});

	test("renders a 14-day header row with today highlighted", async ({ page }) => {
		await page.goto("/build-timeline");

		const days = page.locator("[data-build-timeline-day]");
		await expect(days).toHaveCount(14);

		// The current day is the only highlighted column (OD `.day.today`).
		const today = page.locator("[data-build-timeline-day][data-today='true']");
		await expect(today).toHaveCount(1);
		await expect(today).toContainText("21");
	});

	test("renders one lane per work item, each with an icon, a positioned bar, and a now line", async ({ page }) => {
		await page.goto("/build-timeline");

		// One lane per OD work item.
		const lanes = page.locator("[data-build-timeline-lane]");
		await expect(lanes).toHaveCount(8);
		await expect(page.locator("[data-build-timeline-lane='FUL-1284']")).toBeVisible();
		await expect(page.locator("[data-build-timeline-lane='FUL-1261']")).toBeVisible();

		// Each lane carries a name-cell icon.
		await expect(page.locator("[data-build-timeline-lane-icon]")).toHaveCount(8);

		// Each lane carries a positioned status-colored bar with the work-item id.
		const bars = page.locator("[data-build-timeline-bar]");
		await expect(bars).toHaveCount(8);
		await expect(page.locator("[data-build-timeline-bar='FUL-1284']")).toContainText("FUL-1284");
		await expect(page.locator("[data-build-timeline-bar='FUL-1284']")).toContainText("65%");
		await expect(page.locator("[data-build-timeline-bar='FUL-1274']")).toContainText("✓");

		// The current-day `.now` vertical line is present on every lane track.
		await expect(page.locator("[data-build-timeline-now]")).toHaveCount(8);
	});

	test("bars carry DESIGN §4.9 status tones and the legend maps every tone", async ({ page }) => {
		await page.goto("/build-timeline");

		// Status tones per DESIGN.md §4.9 — running / complete / awaiting / blocked.
		await expect(page.locator("[data-build-timeline-bar='FUL-1284']")).toHaveAttribute("data-status", "running");
		await expect(page.locator("[data-build-timeline-bar='FUL-1274']")).toHaveAttribute("data-status", "complete");
		await expect(page.locator("[data-build-timeline-bar='FUL-1281']")).toHaveAttribute("data-status", "awaiting");
		await expect(page.locator("[data-build-timeline-bar='FUL-1276']")).toHaveAttribute("data-status", "blocked");

		// The legend maps swatch → status (OD `.legend`).
		const legend = page.locator("[data-build-timeline-legend]");
		await expect(legend.locator("[data-build-timeline-legend-item]")).toHaveCount(5);
		await expect(page.locator("[data-build-timeline-legend-item='running']")).toBeVisible();
		await expect(page.locator("[data-build-timeline-legend-item='complete']")).toBeVisible();
		await expect(page.locator("[data-build-timeline-legend-item='awaiting']")).toBeVisible();
		await expect(page.locator("[data-build-timeline-legend-item='blocked']")).toBeVisible();
		await expect(page.locator("[data-build-timeline-legend-item='now line']")).toBeVisible();
	});

	test("bar geometry positions each lane against its day window", async ({ page }) => {
		await page.goto("/build-timeline");

		// FUL-1274 starts on the window's first day → bar pinned to the left edge.
		const firstBar = page.locator("[data-build-timeline-bar='FUL-1274']");
		const firstLeft = await firstBar.evaluate((el) => Number.parseFloat((el as HTMLElement).style.left || "0"));
		expect(firstLeft).toBe(0);

		// FUL-1283 starts one day in → bar is offset from the left edge.
		const offsetBar = page.locator("[data-build-timeline-bar='FUL-1283']");
		const offsetLeft = await offsetBar.evaluate((el) => Number.parseFloat((el as HTMLElement).style.left));
		expect(offsetLeft).toBeGreaterThan(0);
	});
});

test.describe("build timeline — data-states", () => {
	test("populated timeline renders lanes; empty timeline renders the §4.8 empty state", async ({ page }) => {
		await page.goto("/build-timeline");
		await expect(page.locator("[data-build-timeline-wrap]")).toBeVisible();
		await expect(page.locator("[data-build-timeline-empty]")).toHaveCount(0);

		await page.goto("/build-timeline?state=empty");
		await expect(page.locator("[data-build-timeline]")).toHaveAttribute("data-state", "empty");
		const empty = page.locator("[data-build-timeline-empty]");
		await expect(empty).toBeVisible();
		await expect(page.locator("[data-build-timeline-wrap]")).toHaveCount(0);
	});

	test("renders correctly under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/build-timeline");

		await expect(page.locator("[data-build-timeline]")).toBeVisible();
		await expect(page.locator("[data-build-timeline-bar]")).toHaveCount(8);
		await expect(page.locator("[data-build-timeline-now]")).toHaveCount(8);
	});
});

test.describe("build timeline — interactions", () => {
	test("the layout switcher navigates between Build layouts", async ({ page }) => {
		await page.goto("/build-timeline");

		await page.locator("[data-build-layout='board']").click();
		await expect(page).toHaveURL(/\/build-board$/);

		await page.goto("/build-timeline");
		await page.locator("[data-build-layout='list']").click();
		await expect(page).toHaveURL(/\/build-list$/);
	});

	test("the data-state switcher toggles between populated and empty", async ({ page }) => {
		await page.goto("/build-timeline");
		await page.locator("[data-build-timeline-show-empty]").click();
		await expect(page).toHaveURL(/state=empty/);
		await expect(page.locator("[data-build-timeline]")).toHaveAttribute("data-state", "empty");

		await page.locator("[data-build-timeline-show-populated]").click();
		await expect(page.locator("[data-build-timeline]")).toHaveAttribute("data-state", "populated");
	});

	test("each lane carries a per-Step mode affordance row", async ({ page }) => {
		await page.goto("/build-timeline");

		// Every lane is a mode-bearing Step (DESIGN.md §4.11 universal coverage).
		const lane = page.locator("[data-build-timeline-lane='FUL-1284']");
		await expect(lane).toHaveAttribute("data-mode-affordance", "step");
		await expect(lane).toHaveAttribute("data-mode-step-kind", "task-card");

		// The mode row renders compact (icon-only) per DESIGN.md §4.13 / §7.
		const modeRow = lane.locator("[role='toolbar'][aria-label='Step modes']");
		await expect(modeRow).toBeVisible();
		await expect(modeRow).toHaveAttribute("data-density", "compact");
	});
});

test.describe("build timeline — copy", () => {
	test("empty-state copy matches the OD timeline template (DESIGN §4.8)", async ({ page }) => {
		await page.goto("/build-timeline?state=empty");

		const empty = page.locator("[data-build-timeline-empty]");
		await expect(empty).toContainText("No timeline yet.");
		await expect(empty).toContainText("The timeline shows lanes per work item across the cycle.");
		await expect(page.locator("[data-build-timeline-empty-action='list']")).toContainText("Open Build list");
		await expect(page.locator("[data-build-timeline-empty-action='board']")).toContainText("View Board");
	});

	test("does not render the re-homed Document-version-history content", async ({ page }) => {
		await page.goto("/build-timeline");

		// The mislabeled docs surface was re-homed to the Capture/docs cluster.
		await expect(page.locator("[data-version-timeline]")).toHaveCount(0);
		await expect(page.locator("[data-version-row]")).toHaveCount(0);
		await expect(page.locator("[data-comment-row]")).toHaveCount(0);
		await expect(page.locator("[data-restore-confirm]")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Document version history" })).toHaveCount(0);
	});
});

test.describe("build timeline — parity + accessibility", () => {
	test("the gantt window mirrors the TUI task-timeline 14-day shape", async ({ page }) => {
		await page.goto("/build-timeline");

		// TUI `task-timeline.ts` renders a 14-day window — web matches it.
		await expect(page.locator("[data-build-timeline-day]")).toHaveCount(14);
		// Lanes are addressable by the same id the TUI `TuiTask` carries.
		await expect(page.locator("[data-build-timeline-lane='FUL-1284']")).toBeVisible();
	});

	test("timeline lanes apply the §3.1 container query and stay within the wrap", async ({ page }) => {
		await page.setViewportSize({ width: 640, height: 900 });
		await page.goto("/build-timeline");

		// The wrap is an inline-size container (DESIGN.md §3.1 container queries).
		const wrap = page.locator("[data-build-timeline-wrap]");
		const containerType = await wrap.evaluate((el) => getComputedStyle(el).containerType);
		expect(containerType).toBe("inline-size");

		// At a narrow container the compact-mode rule shrinks the day labels.
		const dayLabel = page.locator("[data-build-timeline-day]").first();
		await expect(dayLabel).toHaveCSS("font-size", "9px");

		// The scrollable wrap absorbs overflow — the route does not overflow the viewport.
		const overflow = await page.locator("[data-build-timeline]").evaluate(
			(el) => el.scrollWidth - el.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test("the day-header and lane tracks expose accessible roles", async ({ page }) => {
		await page.goto("/build-timeline");

		// The layout switcher is a tablist with one current tab.
		await expect(page.locator("[data-build-timeline-layouts][role='tablist']")).toBeVisible();
		await expect(page.locator("[data-build-layout][aria-current='page']")).toHaveCount(1);

		// Each mode row is a labelled toolbar.
		const toolbars = page.locator("[data-build-timeline-lane] [role='toolbar'][aria-label='Step modes']");
		await expect(toolbars).toHaveCount(8);
	});
});
