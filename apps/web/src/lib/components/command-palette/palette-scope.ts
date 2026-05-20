/**
 * @module palette-scope
 *
 * Derives the `⌘K` palette's active `PaletteScope` tuple
 * `(workspace, project, stage, step, trace)` from the running shell.
 *
 * The OD `palette.html` fixes its Scope through a `window.FULCRUM` context
 * object; production has no such global, so the palette reconstructs the same
 * tuple from two live sources:
 *
 *  1. The route — `stageForPath` maps the current pathname to a WorkflowStage,
 *     and the `/projects/<id>` segment yields the active project id. This is
 *     always available, so the palette is Scope-aware on every route.
 *  2. The active Step — surfaced by a `fulcrum:palette-step-scope` window
 *     CustomEvent, the same window-event pattern the `mode-affordance-host`
 *     uses for `fulcrum:open-ai-assist`. A Step-bearing surface dispatches it
 *     when a Step gains focus and dispatches a `null`-detail event when the
 *     Step is cleared. The palette shows the Step-actions section ONLY while a
 *     Step scope is live (IA-MAP §6.4 "only when invoked on a step").
 *
 * Keeping derivation here (not in the component) means the palette component
 * stays a thin renderer and the Scope rule is unit-testable without a DOM.
 */

import { stageForPath, type WorkflowStage } from "../app/nav-data.ts";
import type { PaletteScope, PaletteStepScope } from "./palette-sections.ts";

/** The window event a Step-bearing surface dispatches to scope the palette to a Step. */
export const PALETTE_STEP_SCOPE_EVENT = "fulcrum:palette-step-scope";

/** Detail payload for `fulcrum:palette-step-scope`; `null` clears the Step scope. */
export type PaletteStepScopeDetail = PaletteStepScope | null;

/** Inputs needed to derive the route-half of the Scope tuple. */
export interface RouteScopeInput {
	/** The current pathname (`page.url.pathname`). */
	pathname: string;
	/** The active workspace label. Defaults to `fulcrum`. */
	workspace?: string;
	/** The active project id resolved by the shell layout, when known. */
	activeProjectId?: string | null;
	/** The active project's human label, when known. */
	activeProjectLabel?: string | null;
}

/** Pull the active project id out of a `/projects/<id>/…` pathname, if present. */
export function projectIdFromPath(pathname: string): string | null {
	const match = pathname.match(/\/projects\/([^/]+)/);
	return match ? match[1] : null;
}

/**
 * Build the route-derived half of the Scope tuple — stage + project + workspace.
 * The Step half is layered on by `withStepScope` once a Step event arrives.
 */
export function deriveRouteScope(input: RouteScopeInput): PaletteScope {
	const stage: WorkflowStage = stageForPath(input.pathname);
	const projectId = input.activeProjectId ?? projectIdFromPath(input.pathname);
	return {
		workspace: input.workspace ?? "fulcrum",
		projectId,
		projectLabel: input.activeProjectLabel ?? projectId ?? null,
		stage,
		step: null,
		traceId: null,
		agent: null,
	};
}

/**
 * Merge a Step scope (from the `fulcrum:palette-step-scope` event) onto a
 * route-derived Scope. A `null` step returns the base Scope unchanged — the
 * palette then omits the Step-actions section.
 */
export function withStepScope(
	base: PaletteScope,
	step: PaletteStepScopeDetail,
): PaletteScope {
	if (!step) return { ...base, step: null };
	return {
		...base,
		step,
		traceId: step.traceId ?? base.traceId ?? null,
	};
}
