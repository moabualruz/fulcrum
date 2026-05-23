import { WorkflowModeValues, type WorkflowMode } from "@fulcrum/shared-dto";
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

/**
 * ModeRow: the universal per-Step mode affordance row (DESIGN.md §4.11, §4.13).
 *
 * Every Step (task card, doc block, review item, artifact row, subsystem row,
 * audit row) carries one ModeRow. It exposes the four canonical execution
 * modes: Manual / Play / Discuss / AI Assist: as a single `role="toolbar"`
 * group so a keyboard user reaches every mode with one Tab stop and the arrow
 * keys, exactly like the OD `.mode-row` markup.
 *
 * The legacy `trace` mode is retained as an optional fifth mode for surfaces
 * (the `/ai-assist` reference route) that already opted into a trace tab; it
 * is not part of the canonical four and is never rendered unless requested.
 */

export type { WorkflowMode } from "@fulcrum/shared-dto";

/**
 * ModeRow accepts the canonical shared workflow modes plus two UI-only legacy
 * aliases used by older reference surfaces.
 */
export type ModeRowMode = WorkflowMode | "ai-assist" | "trace";

/** Density form the row renders in (DESIGN.md §4.13). */
export type ModeRowDensity = "long" | "compact" | "tight";

/** The canonical labelled label for each mode (DESIGN.md §4.13 long form). */
const MODE_LABEL: Record<ModeRowMode, string> = {
	manual: "Manual",
	play: "Play",
	discuss: "Discuss",
	assist: "AI Assist",
	"ai-assist": "AI Assist",
	trace: "Trace",
};

/** The label used in the `tight` form, where Manual/Assist are noise. */
const MODE_TIGHT_LABEL: Record<ModeRowMode, string> = {
	manual: "Manual",
	play: "Suggest",
	discuss: "Discuss",
	assist: "AI Assist",
	"ai-assist": "AI Assist",
	trace: "Trace",
};

/** Canonical text identifier per mode (icons render as lucide SVG components in the view). */
const MODE_GLYPH: Record<ModeRowMode, string> = {
	manual: "Manual",
	play: "Play",
	discuss: "Discuss",
	assist: "AI Assist",
	"ai-assist": "AI Assist",
	trace: "Trace",
};

/** Per-action `title`/tooltip text: DESIGN.md §4.13 requires every mode carries one. */
const MODE_TITLE: Record<ModeRowMode, string> = {
	manual: "Manual: work this step yourself",
	play: "Play: hand off to an AI agent",
	discuss: "Discuss: open the comment thread",
	assist: "AI Assist: open the AI Assist drawer scoped to this step",
	"ai-assist": "AI Assist: open the AI Assist drawer scoped to this step",
	trace: "Trace: inspect the run trace and timeline",
};

export type ModeRowProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	/** The currently-selected mode. Bindable. */
	value?: ModeRowMode;
	/** Fires whenever a mode button is activated. */
	onSelect?: (mode: ModeRowMode) => void;
	/** The modes rendered, in order. Defaults to the canonical four. */
	modes?: ModeRowMode[];
	/** Density form: `long` labelled, `compact` icon-only, `tight` Suggest/Discuss. */
	density?: ModeRowDensity;
	/** Toolbar `aria-label`. DESIGN.md §4.13 canonical value is `Step modes`. */
	ariaLabel?: string;
};

/** The canonical four workflow modes (DESIGN.md §4.13). */
export const WORKFLOW_MODES = [...WorkflowModeValues] satisfies WorkflowMode[];

/** The `tight`-form mode subset: Suggest + Discuss only (DESIGN.md §4.13). */
export const TIGHT_MODES: WorkflowMode[] = ["play", "discuss"];

/** Stable resolution of a mode to its canonical glyph: exported for sibling surfaces. */
export function modeGlyph(mode: ModeRowMode): string {
	return MODE_GLYPH[mode];
}

/** Stable resolution of a mode to its long-form label: exported for sibling surfaces. */
export function modeLabel(mode: ModeRowMode): string {
	return MODE_LABEL[mode];
}
