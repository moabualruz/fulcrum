/**
 * @module capture-stage
 *
 * View model for the Capture WorkflowStage workbench
 * (`prd-web-capture-stage-shell`; IA-MAP.md §2.1; OD `capture.html`,
 * `capture-drafts.html`, `capture-promoted.html`).
 *
 * The Capture stage is the first WorkflowStage: rough input is captured,
 * drafts are managed, and promoted captures move into Plan / Build work. The
 * OD prototype renders this as one stage with four sub-views: the docs tree
 * editor, the Drafts list, the Promoted list, and the intake queue. Before
 * this module the live web app exposed those fragments as unrelated routes
 * (`/docs`, `/inbox`, `/editor-blockquote`) with no shared stage identity
 * (the PRD `problem` statement).
 *
 * This module is the single source of truth for:
 *
 *  1. `CAPTURE_VIEWS`: the four canonical Capture sub-views, their labels,
 *     their `?view=` query slug, and their default-view ordering.
 *  2. `resolveCaptureView()`: map a raw `?view=` query value onto a canonical
 *     `CaptureView`, defaulting to the docs tree.
 *  3. `CAPTURE_EMPTY_COPY`: the locked COPY.md §2 empty-state strings each
 *     sub-view renders when it has no data (one sentence + one action: the
 *     `prd-cross-empty-error-state-system` contract).
 *  4. `CAPTURE_ONBOARDING_COPY`: the COPY.md §7 first-run onboarding strings.
 *
 * It owns NO data fetching: the Capture workbench composes the existing
 * `docs` / `inbox` data surfaces (migration-strategy.md "preserve behavior,
 * replace chrome"); this module is the stage-identity + copy layer only.
 */

/** One Capture sub-view: a tab/projection of the single Capture stage. */
export type CaptureView = "docs" | "drafts" | "promoted" | "inbox";

/** A Capture sub-view descriptor: label + `?view=` slug + one-line purpose. */
export interface CaptureViewEntry {
	/** Canonical sub-view id, used as the `?view=` query value. */
	view: CaptureView;
	/** Title-case label rendered on the sub-view tab strip. */
	label: string;
	/** One-line purpose, OD page-head form. */
	purpose: string;
}

/**
 * The four Capture sub-views in OD order: the docs tree editor first (the
 * default Capture surface), then Drafts, Promoted, and the intake queue.
 * IA-MAP.md §2.1 lists exactly these surfaces under the Capture stage.
 */
export const CAPTURE_VIEWS: readonly CaptureViewEntry[] = [
	{ view: "docs", label: "Docs", purpose: "Document tree and freeform editor" },
	{ view: "drafts", label: "Drafts", purpose: "Unsent captures not yet promoted" },
	{ view: "promoted", label: "Promoted", purpose: "Captures that moved into a plan or run" },
	{ view: "inbox", label: "Inbox", purpose: "Intake queue: snooze, accept, decline" },
] as const;

/** The Capture stage default sub-view (the docs tree editor). */
export const CAPTURE_DEFAULT_VIEW: CaptureView = "docs";

/** Type guard: is `value` one of the four canonical Capture sub-views? */
export function isCaptureView(value: string): value is CaptureView {
	return CAPTURE_VIEWS.some((entry) => entry.view === value);
}

/**
 * Resolve a raw `?view=` query value onto a canonical `CaptureView`. An
 * unknown or absent value falls back to the docs tree: the Capture stage
 * always has a renderable default sub-view, never a 404.
 */
export function resolveCaptureView(raw: string | null | undefined): CaptureView {
	if (raw && isCaptureView(raw)) return raw;
	return CAPTURE_DEFAULT_VIEW;
}

/** Locate the descriptor for a Capture sub-view. */
export function captureViewEntry(view: CaptureView): CaptureViewEntry {
	return CAPTURE_VIEWS.find((entry) => entry.view === view) ?? CAPTURE_VIEWS[0];
}

/**
 * The locked Capture empty-state copy. Each entry is one sentence describing
 * the empty surface plus exactly one primary action label: the
 * `prd-cross-empty-error-state-system` contract. The `drafts` strings are
 * COPY.md §2 verbatim (`capture-drafts` template); `promoted` matches the
 * `capture-promoted` strings recorded in `design-alignment/capture.md`.
 */
export interface CaptureEmptyCopy {
	/** Empty-state H2: exact, copy-lock asserted. */
	title: string;
	/** Empty-state body sentence: exact, copy-lock asserted. */
	description: string;
	/** Primary action label. */
	primaryAction: string;
	/** Secondary action label. */
	secondaryAction: string;
	/** Keyboard hint shown beside the primary action. */
	keyHint: string;
}

/** Per-sub-view locked empty-state copy (COPY.md §2). */
export const CAPTURE_EMPTY_COPY: Record<CaptureView, CaptureEmptyCopy> = {
	docs: {
		title: "No documents yet.",
		description: "Capture a document and it appears in the tree. Press c to capture.",
		primaryAction: "New document",
		secondaryAction: "Open inbox",
		keyHint: "c",
	},
	// COPY.md §2 capture-drafts: verbatim.
	drafts: {
		title: "No drafts yet.",
		description: "Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
		primaryAction: "New draft",
		secondaryAction: "Open inbox",
		keyHint: "c",
	},
	// design-alignment/capture.md capture-promoted strings (COPY.md §2 follow-up).
	promoted: {
		title: "No promoted captures yet.",
		description: "Promotions appear here once a draft moves into Plan or Build. Promote one from Drafts to start.",
		primaryAction: "Open Drafts",
		secondaryAction: "Learn more",
		keyHint: "g d",
	},
	inbox: {
		title: "Inbox is clear.",
		description: "New captures arrive here for triage. Capture something to start.",
		primaryAction: "New capture",
		secondaryAction: "Open Drafts",
		keyHint: "c",
	},
} as const;

/**
 * The COPY.md §7 first-run onboarding strings. The Capture surface is the
 * first-run tutorial: no marketing H1, no multi-step wizard (COPY.md §1
 * rule 5). These strings are rendered verbatim on the onboarding/first-capture
 * surface and asserted by the copy-lock.
 */
export const CAPTURE_ONBOARDING_COPY = {
	/** Workspace-name prompt. */
	workspacePrompt: "What's your workspace called?",
	/** Project-description prompt. */
	projectPrompt: "What are you building?",
	/** First blank-canvas capture prompt. */
	firstCapturePrompt: "Type or paste anything. Press Cmd-/ to ask an agent.",
} as const;

/**
 * One Capture Step row: a draft, a promoted capture, or an intake item. A
 * Capture Step carries the universal `ModeAffordance` row (DESIGN.md §4.13:
 * "a Capture block IS a Step"). This is the shape the workbench renders; the
 * production data loaders project the `docs` / `inbox` surfaces onto it.
 */
export interface CaptureStep {
	/** Stable addressable Step id (`cap_8f29a4c`, `doc_3d18`). */
	id: string;
	/** Step title: one line. */
	title: string;
	/** One-line preview / summary. */
	preview: string;
	/** Mono meta string (age · words · author). */
	meta: string;
	/** Optional downstream link target shown on a promoted card (`→ plan_8f29`). */
	downstream?: string;
	/** Optional stage pill tone for a promoted card (`plan` / `build`). */
	stagePill?: "plan" | "build";
}

/**
 * Carry the active trace id across the Capture → Plan handoff. When a Capture
 * draft is promoted to a plan, the trace allocated on the draft must survive
 * into the planning session (IA-MAP.md §2.1 "Trace ID allocated here"). This
 * builds the `/<ws>/projects/<projId>/plan` handoff URL with the trace hash
 * preserved: the same `#trace=<id>` grammar `route-map.ts` uses everywhere.
 */
export function captureHandoffToPlan(
	planStageRoute: string,
	traceId: string | null | undefined,
): string {
	if (!traceId) return planStageRoute;
	const hash = traceId.startsWith("#") ? traceId : `#trace=${traceId}`;
	return planStageRoute.includes("#") ? planStageRoute : `${planStageRoute}${hash}`;
}
