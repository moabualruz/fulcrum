/**
 * @module mode-affordance-host
 *
 * The shared web host for the universal per-Step ModeAffordance row
 * (DESIGN.md §4.11, §4.13; apps/web/CONTEXT.md "ModeAffordance").
 *
 * Every Step: a task card, doc block, review item, artifact row, subsystem
 * row, audit row: carries one ModeAffordance: the `✋ Manual / ▶ Play /
 * 💬 Discuss / ⊞ AI Assist` row rendered by the `@fulcrum/ui-kit` `ModeRow`
 * primitive. Before this module each Step-bearing route hand-wired its own
 * `ModeRow` props, glyphs, density choice, and `⊞` click handler, so the
 * affordance appeared on some preview routes and was absent or inconsistent on
 * the rest (the PRD `prd-web-mode-affordance-system` problem statement).
 *
 * This module makes the affordance UNIVERSAL by being the single place that:
 *
 *  1. picks the right `ModeRow` density for a Step kind (board cards →
 *     `compact`, list/feed rows → `long`, settings/doc surfaces → `tight`);
 *  2. produces the stable `data-*` hooks a Step row MUST carry so the design
 *     gate can prove the affordance is present (`data-mode-affordance`,
 *     `data-mode-step-kind`, `data-mode-step-id`);
 *  3. owns the four mode actions: Manual selects in place, Play opens the
 *     agent mode picker, Discuss opens the step thread, AI Assist opens the
 *     ONE shell `AcpDrawer` scoped to the Step via the `fulcrum:open-ai-assist`
 *     window event (the same event the StatusFooter AI Assist segment and the
 *     `⌘/` chord dispatch: one drawer, many entry points).
 *
 * It re-exports the `ModeRow` primitive and its `WorkflowMode` vocabulary so a
 * route imports the affordance from one host module, never the bare primitive -
 * keeping the `@fulcrum/ui-kit` "one primitive source" rule and the universal
 * coverage gate honest at the same time.
 */

import {
	ModeRow,
	TIGHT_MODES,
	WORKFLOW_MODES,
	modeGlyph,
	modeLabel,
	type ModeRowDensity,
	type WorkflowMode,
} from "@fulcrum/ui-kit";

export { ModeRow, WORKFLOW_MODES, TIGHT_MODES, modeGlyph, modeLabel };
export type { ModeRowDensity, WorkflowMode };

/**
 * The kind of Step a ModeAffordance is attached to. Drawn from DESIGN.md §4.11
 * ("task card, doc block, review item, artifact row, subsystem row, audit
 * row"). The kind picks the density and labels the `data-mode-step-kind` hook.
 */
export type StepKind =
	| "task-card"
	| "doc-block"
	| "review-item"
	| "artifact-row"
	| "subsystem-row"
	| "audit-row"
	| "run-row"
	| "setting-row";

/**
 * The canonical mode-affordance label (DESIGN.md §4.13). The labels are LOCKED
 * copy: `prd-cross-copy-lock` and the design gate assert these exact strings.
 */
export const MODE_AFFORDANCE_LABELS: Record<"manual" | "play" | "discuss" | "assist", string> = {
	manual: "Manual",
	play: "Play",
	discuss: "Discuss",
	assist: "AI Assist",
};

/** The canonical toolbar `aria-label` every ModeAffordance row carries (DESIGN.md §4.13). */
export const MODE_AFFORDANCE_TOOLBAR_LABEL = "Step modes";

/**
 * Which `ModeRow` density a Step kind renders in (DESIGN.md §4.13):
 *  - `compact`: dense board cards / timeline lanes (icon-only, 24×24);
 *  - `tight`  : settings + doc surfaces where Manual/Assist would be noise;
 *  - `long`   : everything else: per-row primary affordance with labels.
 */
const STEP_KIND_DENSITY: Record<StepKind, ModeRowDensity> = {
	"task-card": "compact",
	"doc-block": "tight",
	"review-item": "long",
	"artifact-row": "long",
	"subsystem-row": "compact",
	"audit-row": "compact",
	"run-row": "long",
	"setting-row": "tight",
};

/** Resolve the `ModeRow` density a Step kind renders its affordance in. */
export function densityForStepKind(kind: StepKind): ModeRowDensity {
	return STEP_KIND_DENSITY[kind];
}

/**
 * The scope a ModeAffordance action carries: the `(stage, stepId, traceId)`
 * tuple the AI Assist drawer and the agent picker bind to (apps/web/CONTEXT.md
 * "Scope"). `stepId` is the addressable Step id; `traceId` ties an opened
 * drawer or run to the trace spine (DESIGN.md §4.10).
 */
export interface ModeStepScope {
	/** The Step's stable addressable id (e.g. `AUTH-42`, `doc_8f29`). */
	stepId: string;
	/** The Step kind: selects density, labels `data-mode-step-kind`. */
	kind: StepKind;
	/** Optional trace id the AI Assist session / run should join. */
	traceId?: string;
	/** Optional human title used in the dispatched action detail. */
	title?: string;
}

/** Detail payload carried on the `fulcrum:open-ai-assist` event for a Step. */
export interface ModeAssistDetail {
	stepId: string;
	stepKind: StepKind;
	traceId?: string;
	title?: string;
}

/**
 * The stable `data-*` hook set every Step row MUST spread so the design gate
 * (`mode-affordance.spec.ts`) can prove the affordance is present. A Step list
 * or card row that omits `data-mode-affordance` fails the universal-coverage
 * gate: that is the PRD acceptance "design tests fail if a Step row lacks mode
 * affordance data hooks".
 */
export interface ModeAffordanceHooks {
	/** Marks the element as a mode-affordance-bearing Step row. */
	"data-mode-affordance": string;
	/** The Step kind, for gate filtering. */
	"data-mode-step-kind": StepKind;
	/** The Step's addressable id. */
	"data-mode-step-id": string;
}

/** Build the `data-*` hook set a Step row spreads onto its root element. */
export function modeAffordanceHooks(scope: ModeStepScope): ModeAffordanceHooks {
	return {
		"data-mode-affordance": "step",
		"data-mode-step-kind": scope.kind,
		"data-mode-step-id": scope.stepId,
	};
}

/**
 * A ready-to-spread `ModeRow` binding for a Step: the density and toolbar label
 * resolved from the Step kind, plus an `onSelect` handler that routes each
 * mode to its action. A route renders `<ModeRow {...binding} />` and never
 * re-derives density, labels, or the AI Assist event by hand.
 */
export interface ModeRowBinding {
	density: ModeRowDensity;
	ariaLabel: string;
	modes: WorkflowMode[];
	onSelect: (mode: WorkflowMode) => void;
}

/** Handlers a route can supply to override the default mode actions. */
export interface ModeActionHandlers {
	/** Manual: work the Step yourself. Default: no-op (selection only). */
	onManual?: (scope: ModeStepScope) => void;
	/** Play: hand off to an AI agent. Default: dispatch the mode-picker event. */
	onPlay?: (scope: ModeStepScope) => void;
	/** Discuss: open the Step's comment thread. Default: dispatch the thread event. */
	onDiscuss?: (scope: ModeStepScope) => void;
	/** AI Assist: open the shell drawer scoped to the Step. Default: `fulcrum:open-ai-assist`. */
	onAssist?: (scope: ModeStepScope) => void;
}

/** Dispatch a window CustomEvent: guarded for SSR (no `window` on the server). */
function dispatch(name: string, detail: unknown): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * The default AI Assist action: open the ONE shell `AcpDrawer` scoped to the
 * Step. Identical entry point to the StatusFooter AI Assist segment and the
 * `⌘/` chord: `fulcrum:open-ai-assist`: but carrying a Step scope detail so
 * the drawer can bind its session to the Step + trace.
 */
export function openAssistForStep(scope: ModeStepScope): void {
	const detail: ModeAssistDetail = {
		stepId: scope.stepId,
		stepKind: scope.kind,
		traceId: scope.traceId,
		title: scope.title,
	};
	dispatch("fulcrum:open-ai-assist", detail);
}

/** The default Play action: open the per-Step agent mode picker (DESIGN.md §4.11). */
export function openModePickerForStep(scope: ModeStepScope): void {
	dispatch("fulcrum:open-mode-picker", { stepId: scope.stepId, stepKind: scope.kind });
}

/** The default Discuss action: open the Step's anchored comment thread. */
export function openDiscussForStep(scope: ModeStepScope): void {
	dispatch("fulcrum:open-step-thread", { stepId: scope.stepId, stepKind: scope.kind });
}

/**
 * Build the `ModeRow` binding for a Step. This is the single entry point every
 * Step-bearing route uses: it resolves density from the Step kind, sets the
 * canonical `Step modes` toolbar label, and wires `onSelect` so the four modes
 * dispatch their actions (overridable per route via `handlers`).
 *
 * @example
 *   const modeRow = createStepModeRow({ stepId: task.key, kind: "task-card" });
 *   // <article {...modeAffordanceHooks(scope)}>… <ModeRow {...modeRow} /> …
 */
export function createStepModeRow(
	scope: ModeStepScope,
	handlers: ModeActionHandlers = {},
): ModeRowBinding {
	const density = densityForStepKind(scope.kind);
	return {
		density,
		ariaLabel: MODE_AFFORDANCE_TOOLBAR_LABEL,
		modes: density === "tight" ? [...TIGHT_MODES] : [...WORKFLOW_MODES],
		onSelect: (mode: WorkflowMode) => {
			switch (mode) {
				case "manual":
					handlers.onManual?.(scope);
					return;
				case "play":
					(handlers.onPlay ?? openModePickerForStep)(scope);
					return;
				case "discuss":
					(handlers.onDiscuss ?? openDiscussForStep)(scope);
					return;
				case "assist":
				case "ai-assist":
					(handlers.onAssist ?? openAssistForStep)(scope);
					return;
				default:
					return;
			}
		},
	};
}
