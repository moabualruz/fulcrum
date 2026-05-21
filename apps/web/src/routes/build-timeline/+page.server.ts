import type { PageServerLoad } from "./$types";

/**
 * Build · Timeline — the OD `build-timeline.html` 14-day Gantt Workbench loader.
 *
 * `/build-timeline` previously rendered a mislabeled Document Version Review
 * surface; `prd-cross-mislabeled-route-content-migration` preserved that
 * content under `_migrated-content/+page.svelte.preserved`, re-homed it to the
 * Capture/docs cluster (the live `/docs` route), and left this server file as a
 * 308 redirect stub until the OD Gantt shipped. `prd-web-build-timeline-od-fidelity`
 * now ships the real surface, so the stub is replaced with the production
 * route loader.
 *
 * The loader resolves the 14-day Gantt window and the per-lane work items.
 * Web and TUI must stay in parity (`design-alignment/build.md` — TUI
 * `apps/tui/src/screens/task-timeline.ts` already implements the 14-day Gantt),
 * so the lane shape mirrors the TUI `TuiTask` contract: `id`, `title`,
 * `status`, `startDate`, `endDate`. Bar geometry is derived from the
 * `(windowStart, daysVisible, startDate, endDate)` tuple exactly as the TUI
 * `barFor` helper derives its `startOffset`/`endOffset`.
 *
 * This app owns zero persistence (`apps/web/CONTEXT.md`): a real deployment
 * resolves the cycle window + lanes from the work-management service via tRPC.
 * The fixture window below is the rendered-fidelity dataset the design gate
 * drives — it is route load data, not a production mock embedded in the
 * component, and it matches the OD `build-timeline.html` lanes 1:1.
 */

/** A Gantt lane — one work item, shaped to the TUI `TuiTask` parity contract. */
export interface TimelineLane {
	/** Stable work-item id (the bar label, e.g. `FUL-1284`). */
	id: string;
	/** Work-item title rendered in the lane name cell. */
	title: string;
	/**
	 * Lane status, mapped to a `DESIGN.md §4.9` bar tone:
	 * `running` → accent, `complete` → success, `awaiting` → warn,
	 * `blocked` → danger.
	 */
	status: "running" | "complete" | "awaiting" | "blocked";
	/** Lane icon glyph (the OD `data-ic` per-lane icon). */
	icon: string;
	/** ISO `YYYY-MM-DD` bar start (inclusive). */
	startDate: string;
	/** ISO `YYYY-MM-DD` bar end (inclusive). */
	endDate: string;
	/** Optional 0–100 progress shown on the bar (OD `FUL-1284 · 65%`). */
	progress?: number;
}

/** The resolved Build Gantt window the Workbench renders. */
export interface BuildTimelineData {
	/** Cycle label shown in the page-head count line. */
	cycle: string;
	/** ISO `YYYY-MM-DD` of the first day column. */
	windowStart: string;
	/** Number of day columns (the OD Gantt is a 14-day window). */
	daysVisible: number;
	/** ISO `YYYY-MM-DD` of the highlighted current day (the `.now` line). */
	today: string;
	/** One entry per Gantt lane. */
	lanes: TimelineLane[];
	/** When true the route renders the empty-state branch. */
	isEmpty: boolean;
}

/**
 * The OD `build-timeline.html` Gantt window: cycle `24w13`, 14 days starting
 * Mar 18, today Mar 21, eight lanes. Bar dates are derived from the OD inline
 * `left`/`width` percentages (each 1/14 of the window) so the rendered bars
 * land on the same day columns as the OD file.
 */
const BUILD_TIMELINE_WINDOW: BuildTimelineData = {
	cycle: "cycle 24w13",
	windowStart: "2026-03-18",
	daysVisible: 14,
	today: "2026-03-21",
	isEmpty: false,
	lanes: [
		{
			id: "FUL-1284",
			title: "Token refresh (offline)",
			status: "running",
			icon: "git-pull-request",
			startDate: "2026-03-18",
			endDate: "2026-03-22",
			progress: 65,
		},
		{
			id: "FUL-1283",
			title: "Trace stitch (web+CLI+TUI)",
			status: "running",
			icon: "radio",
			startDate: "2026-03-19",
			endDate: "2026-03-22",
		},
		{
			id: "FUL-1281",
			title: "MCP health rollup",
			status: "awaiting",
			icon: "activity",
			startDate: "2026-03-20",
			endDate: "2026-03-21",
		},
		{
			id: "FUL-1276",
			title: "Drag-drop keyboard",
			status: "blocked",
			icon: "grid",
			startDate: "2026-03-21",
			endDate: "2026-03-21",
		},
		{
			id: "FUL-1274",
			title: "Sugiyama graph engine",
			status: "complete",
			icon: "workflow",
			startDate: "2026-03-18",
			endDate: "2026-03-20",
		},
		{
			id: "FUL-1268",
			title: "TUI ↔ web footer parity",
			status: "complete",
			icon: "terminal",
			startDate: "2026-03-19",
			endDate: "2026-03-20",
		},
		{
			id: "FUL-1265",
			title: "Run envelope (CLI v1)",
			status: "awaiting",
			icon: "message-circle",
			startDate: "2026-03-22",
			endDate: "2026-03-24",
		},
		{
			id: "FUL-1261",
			title: "Plan templates library",
			status: "running",
			icon: "book",
			startDate: "2026-03-21",
			endDate: "2026-03-25",
		},
	],
};

/**
 * Resolve the Build Gantt window. `?state=empty` drives the OD hidden
 * `data-empty-for="timeline"` empty state so the design gate can prove both
 * the `populated` and `empty` data-states without a separate route.
 */
export const load: PageServerLoad = ({ url }) => {
	const isEmpty = url.searchParams.get("state") === "empty";
	return {
		timeline: isEmpty
			? { ...BUILD_TIMELINE_WINDOW, lanes: [], isEmpty: true }
			: BUILD_TIMELINE_WINDOW,
	} satisfies { timeline: BuildTimelineData };
};
