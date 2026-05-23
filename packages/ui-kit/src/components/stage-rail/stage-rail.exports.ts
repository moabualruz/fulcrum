import { WorkflowStageValues, type WorkflowStage } from "@fulcrum/shared-dto";
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type { WorkflowStage } from "@fulcrum/shared-dto";

/** The six left-to-right WorkflowStages (DESIGN.md §3.1, IA-MAP.md §3). */
export const WORKFLOW_STAGES = [...WorkflowStageValues] satisfies WorkflowStage[];

const STAGE_LABEL: Record<WorkflowStage, string> = {
	capture: "Capture",
	plan: "Plan",
	build: "Build",
	review: "Review",
	ship: "Ship",
	operate: "Operate",
};

const STAGE_GLYPH: Record<WorkflowStage, string> = {
	capture: "✎",
	plan: "◇",
	build: "▢",
	review: "◷",
	ship: "▲",
	operate: "◉",
};

/**
 * An active-stage sub-navigation entry. Per the OD `desktop-shell.html` rail
 * replica, the StageRail's primary group is the *sub-navigation of the current
 * stage* (e.g. under `Plan`: Sessions / Reviews / Prototypes / Templates /
 * Prompts): NOT the six-stage Capture→Operate axis. That workflow axis is
 * owned by the ScopeBar stage-tab strip; the rail never renders it.
 */
export type StageRailSubnavItem = {
	id: string;
	label: string;
	glyph?: string;
	href?: string;
	/** Optional mono count badge mirroring the OD rail (`Sessions 3`). */
	count?: number;
};

/** A System-group entry rendered below the divider (Settings · Knowledge · MCP · Plugins). */
export type StageRailSystemItem = {
	id: string;
	label: string;
	glyph?: string;
	href?: string;
};

/**
 * A Workspace-group entry: the persistent portfolio destinations (All projects,
 * Search, Memory, Context) that travel with every WorkflowStage. Rendered above
 * the System divider so it never competes visually with the active-stage
 * sub-navigation (DESIGN.md §3.1, IA-MAP.md §3: the OD `desktop-shell.html`
 * `Workspace` group).
 */
export type StageRailWorkspaceItem = {
	id: string;
	label: string;
	glyph?: string;
	href?: string;
	/** Optional mono count badge mirroring the OD rail (`Inbox 2`). */
	count?: number;
};

/**
 * Legacy six-stage axis item. The StageRail no longer owns the workflow-stage
 * axis (`prd-web-shell-stage-axis-ownership-fix`): the ScopeBar tab strip does.
 * `stages` is retained only so the `/design-kit` fixture can exercise the older
 * stage-list rendering; production shell consumers MUST pass `substages`
 * instead. When `substages` is non-empty, `stages` is ignored entirely.
 */
export type StageRailItem = {
	stage: WorkflowStage;
	href?: string;
	count?: number;
};

export type StageRailProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	/**
	 * The active WorkflowStage. Drives `data-current` so the ScopeBar and the
	 * rail stay in sync, and labels the sub-navigation group; it is *data*, not
	 * a rendered six-stage list.
	 */
	current?: WorkflowStage;
	/** Collapsed = 56px icon-only rail; expanded = 220px (DESIGN.md §3.1). */
	collapsed?: boolean;
	/**
	 * Active-stage sub-navigation: the rail's primary group. The group header
	 * label is the active stage's name (e.g. `Plan`).
	 */
	substages?: StageRailSubnavItem[];
	/**
	 * Legacy six-stage axis. Retained for the `/design-kit` fixture only;
	 * ignored when `substages` is non-empty. Production must not pass this.
	 */
	stages?: StageRailItem[];
	/** Workspace (Portfolio) group rendered between the sub-nav and the System divider. */
	workspace?: StageRailWorkspaceItem[];
	/** System group rendered after the divider. */
	system?: StageRailSystemItem[];
	ariaLabel?: string;
	onSelect?: (stage: WorkflowStage) => void;
};
