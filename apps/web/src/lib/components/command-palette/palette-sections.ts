/**
 * @module palette-sections
 *
 * The Scope-aware section model for the `⌘K` CommandPalette
 * (IA-MAP.md §6 "Command palette (⌘K) contents", DESIGN.md §4.12).
 *
 * The OD `palette.html` palette is "the same surface from every frame": the
 * result set it shows is a function of the active Scope tuple
 * `(workspace, project, stage, step, trace)`: the `window.FULCRUM` context
 * object in the OD prototype. This module turns a `PaletteScope` into the
 * exact ordered section list IA-MAP §6 locks:
 *
 *   1. Recent             : 4 frecency-ranked entries
 *   2. Workflow stage nav : Go to Capture / Plan / Build / Review / Ship / Operate
 *   3. Project switcher   : projects, recent, "All projects"
 *   4. Step actions       : ONLY when a Step is in scope; the ModeAffordance set
 *   5. Federated search   : docs / tasks / runs / artifacts / memory / audit
 *   6. Settings search    : every settings field by name
 *   7. Workspace + theme  : switch workspace, toggle theme, density mode
 *   8. Help               : keyboard cheatsheet, docs
 *
 * Section labels are LOCKED copy: `prd-cross-copy-lock` and the palette design
 * gate assert these exact strings.
 *
 * The Step-actions section consumes the `mode-affordance-host` action set
 * (`openModePickerForStep` / `openDiscussForStep` / `openAssistForStep`): it
 * never hand-rolls a parallel Play/Discuss/AI-Assist list (the
 * `prd-web-mode-affordance-system` action set is the single source).
 */

import { STAGE_NAV_ITEMS, type WorkflowStage } from "../app/nav-data.ts";
import {
	openAssistForStep,
	openDiscussForStep,
	openModePickerForStep,
	type ModeStepScope,
} from "../app/mode-affordance-host.ts";
import type { CommandItem } from "./command-palette-filter.ts";

/**
 * The eight IA-MAP §6 palette section ids, in canonical order. The palette
 * renders sections in exactly this sequence; `Step actions` is omitted when no
 * Step is in scope, but never reordered.
 */
export type PaletteSectionId =
	| "recent"
	| "stage-nav"
	| "project-switcher"
	| "step-actions"
	| "federated-search"
	| "settings-search"
	| "workspace-theme"
	| "help";

/**
 * The LOCKED visible label for each section (IA-MAP §6 "Sections (in order)").
 * The palette design gate asserts these strings verbatim.
 */
export const PALETTE_SECTION_LABEL: Record<PaletteSectionId, string> = {
	recent: "Recent",
	"stage-nav": "Workflow stage nav",
	"project-switcher": "Project switcher",
	"step-actions": "Step actions",
	"federated-search": "Federated search",
	"settings-search": "Settings search",
	"workspace-theme": "Workspace + theme",
	help: "Help",
};

/** The canonical section order: `Step actions` slots between switcher and search. */
export const PALETTE_SECTION_ORDER: readonly PaletteSectionId[] = [
	"recent",
	"stage-nav",
	"project-switcher",
	"step-actions",
	"federated-search",
	"settings-search",
	"workspace-theme",
	"help",
] as const;

/** A Step in palette scope: surfaces the Step-actions section (IA-MAP §6.4). */
export interface PaletteStepScope extends ModeStepScope {
	/** Human Step title shown in the Step-actions section header + run actions. */
	title: string;
	/** 1-based Step index for the `Play step N` / `Discuss step N` copy. */
	index?: number;
	/** Total Step count, for the `N / total` scope chip. */
	total?: number;
}

/**
 * The active Scope tuple the palette resolves against: the OD `window.FULCRUM`
 * context object (`stage`, `route`, `trace`, `runId`, `agent`, `branch`).
 * Changing any field changes the section result set, so the palette is
 * Scope-aware (DESIGN.md §4.12 "Context detector reads route + active step").
 */
export interface PaletteScope {
	/** The active workspace label (`fulcrum` in OD). */
	workspace: string;
	/** The active project id, or `null` in a portfolio (no-project) Scope. */
	projectId: string | null;
	/** The active project's human label, when a project is in scope. */
	projectLabel?: string | null;
	/** The active WorkflowStage derived from the route. */
	stage: WorkflowStage;
	/** The active Step, when the palette was invoked on a Step: drives §6.4. */
	step?: PaletteStepScope | null;
	/** The active trace id, for the `Copy trace ID` Step action. */
	traceId?: string | null;
	/** The active agent label (`claude-opus-4.7` in OD), for the scope chip. */
	agent?: string | null;
}

/**
 * A palette row. Extends `CommandItem` (so the existing `filterAndSort` fuzzy
 * matcher works unchanged) with the section it belongs to, an optional Lucide
 * icon name, a muted `description` subtitle, a right-aligned `kbd` hint, and an
 * optional non-navigation `run` action (for Step actions / toggles).
 */
export interface PaletteRow extends CommandItem {
	/** Which IA-MAP §6 section the row renders under. */
	section: PaletteSectionId;
	/** Lucide icon name (DESIGN.md §6 icon map); rendered at the row leading edge. */
	icon?: string;
	/** Muted subtitle under/beside the label (OD `.desc`). */
	description?: string;
	/** Right-aligned keyboard hint (OD `.kbd`). */
	kbd?: string;
	/** Imperative action for non-navigation rows (Step actions, theme toggles). */
	run?: () => void;
}

/** A resolved section: its id, locked label, and the rows it currently holds. */
export interface PaletteSection {
	id: PaletteSectionId;
	label: string;
	rows: PaletteRow[];
}

/** The six WorkflowStage nav targets: IA-MAP §6.2 / §3 stage axis. */
const STAGE_LABEL: Record<WorkflowStage, string> = {
	capture: "Capture",
	plan: "Plan",
	build: "Build",
	review: "Review",
	ship: "Ship",
	operate: "Operate",
};

/** DESIGN.md §6 locked icon per stage. */
const STAGE_ICON: Record<WorkflowStage, string> = {
	capture: "inbox",
	plan: "compass",
	build: "hammer",
	review: "eye",
	ship: "package",
	operate: "activity",
};

/**
 * The Workflow stage nav rows: `Go to Capture … Go to Operate` in IA-MAP §6.2
 * order. Each row navigates to the stage's canonical home (`STAGE_NAV_ITEMS`).
 * The active stage row is tagged so the palette can mark it `aria-current`.
 */
export function stageNavRows(scope: PaletteScope): PaletteRow[] {
	return STAGE_NAV_ITEMS.map((item) => ({
		id: `stage-${item.stage}`,
		label: `Go to ${STAGE_LABEL[item.stage]}`,
		href: item.href,
		section: "stage-nav" as const,
		icon: STAGE_ICON[item.stage],
		description: item.stage === scope.stage ? "current stage" : undefined,
	}));
}

/**
 * The Step-actions rows: IA-MAP §6.4. Returned ONLY when a Step is in scope;
 * an empty array otherwise (the section is then omitted entirely). The
 * Play / Discuss / AI Assist rows delegate to the `mode-affordance-host`
 * action set so the palette and the per-Step `ModeRow` share one action source.
 */
export function stepActionRows(scope: PaletteScope): PaletteRow[] {
	const step = scope.step;
	if (!step) return [];

	const stepRef = step.index ? `step ${step.index}` : "this step";
	const modeScope: ModeStepScope = {
		stepId: step.stepId,
		kind: step.kind,
		traceId: step.traceId ?? scope.traceId ?? undefined,
		title: step.title,
	};

	const rows: PaletteRow[] = [
		{
			id: "step-play",
			label: `Play ${stepRef}: ${step.title}`,
			section: "step-actions",
			icon: "play",
			description: scope.agent ? `${scope.agent} · ask-on-write` : "hand off to an agent",
			kbd: "p",
			run: () => openModePickerForStep(modeScope),
		},
		{
			id: "step-discuss",
			label: `Discuss ${stepRef}`,
			section: "step-actions",
			icon: "message-square",
			description: "open inline thread anchored to this step",
			kbd: "d",
			run: () => openDiscussForStep(modeScope),
		},
		{
			id: "step-assist",
			label: "Open in AI Assist drawer",
			section: "step-actions",
			icon: "panel-right",
			description: "ask the agent why it picked this hunk",
			kbd: "⌘/",
			run: () => openAssistForStep(modeScope),
		},
	];

	const traceId = step.traceId ?? scope.traceId;
	if (traceId) {
		rows.push({
			id: "step-copy-trace",
			label: "Copy trace ID",
			section: "step-actions",
			icon: "link-2",
			description: traceId,
			run: () => copyTrace(traceId),
		});
	}

	rows.push({
		id: "step-open-audit",
		label: "Open in audit",
		section: "step-actions",
		icon: "search",
		description: "every event for this step on the trace spine",
		href: traceId ? `/audit?trace=${traceId}` : "/audit",
	});

	return rows;
}

/** Copy a trace id to the clipboard: guarded for SSR / missing clipboard. */
function copyTrace(traceId: string): void {
	if (typeof navigator === "undefined" || !navigator.clipboard) return;
	void navigator.clipboard.writeText(traceId);
}

/**
 * The Project switcher rows: IA-MAP §6.3. Surfaces the active project, then a
 * scope-wide "All projects" entry. The `recents` are passed in by the host so
 * the palette stays free of data fetching (the app shell owns the project list).
 */
export function projectSwitcherRows(
	scope: PaletteScope,
	recents: ReadonlyArray<{ id: string; label: string }> = [],
): PaletteRow[] {
	const rows: PaletteRow[] = [];
	if (scope.projectId) {
		rows.push({
			id: `project-${scope.projectId}`,
			label: scope.projectLabel ?? scope.projectId,
			href: `/projects/${scope.projectId}`,
			section: "project-switcher",
			icon: "folder",
			description: "current project",
		});
	}
	for (const recent of recents) {
		if (recent.id === scope.projectId) continue;
		rows.push({
			id: `project-${recent.id}`,
			label: recent.label,
			href: `/projects/${recent.id}`,
			section: "project-switcher",
			icon: "folder",
			description: "recent",
		});
	}
	rows.push({
		id: "project-all",
		label: "All projects",
		href: "/projects",
		section: "project-switcher",
		icon: "folder",
	});
	return rows;
}

/**
 * The Workspace + theme rows: IA-MAP §6.7. `Toggle theme` and density flow
 * through the host (`onToggleTheme`); `Switch workspace` navigates to the
 * workspace switcher.
 */
export function workspaceThemeRows(
	scope: PaletteScope,
	handlers: { onToggleTheme?: () => void; onDensityMode?: () => void } = {},
): PaletteRow[] {
	return [
		{
			id: "ws-switch",
			label: "Switch workspace",
			href: "/settings/workspace",
			section: "workspace-theme",
			icon: "folder",
			description: scope.workspace,
		},
		{
			id: "ws-theme",
			label: "Toggle theme",
			section: "workspace-theme",
			icon: "settings",
			description: "light / dark",
			run: handlers.onToggleTheme,
		},
		{
			id: "ws-density",
			label: "Density mode",
			href: "/settings/data",
			section: "workspace-theme",
			icon: "settings",
			description: "compact / cozy / comfortable",
			run: handlers.onDensityMode,
		},
	];
}

/** The Help rows: IA-MAP §6.8: keyboard cheatsheet + docs. */
export function helpRows(handlers: { onShortcuts?: () => void } = {}): PaletteRow[] {
	return [
		{
			id: "help-shortcuts",
			label: "Keyboard cheatsheet",
			section: "help",
			icon: "settings",
			description: "every shortcut on this surface",
			kbd: "?",
			run: handlers.onShortcuts,
		},
		{
			id: "help-docs",
			label: "Help & docs",
			href: "/docs",
			section: "help",
			icon: "file-text",
			description: "product documentation",
		},
	];
}

/** A federated-search hit row: docs / tasks / runs / artifacts / memory / audit. */
export interface FederatedHit {
	id: string;
	title: string;
	kind: string;
	href: string;
}

/** DESIGN.md §6 icon per federated-entity kind; falls back to `search`. */
const KIND_ICON: Record<string, string> = {
	doc: "file-text",
	document: "file-text",
	task: "square-check",
	run: "play-circle",
	artifact: "archive",
	memory: "brain",
	audit: "search",
};

/** Map federated-search hits into palette rows under the Federated search section. */
export function federatedSearchRows(hits: ReadonlyArray<FederatedHit>): PaletteRow[] {
	return hits.map((hit) => ({
		id: `search-${hit.id}`,
		label: hit.title,
		href: hit.href,
		section: "federated-search" as const,
		icon: KIND_ICON[hit.kind] ?? "search",
		description: hit.kind,
	}));
}

/**
 * Inputs the host (`CommandPalette.svelte`) feeds the resolver each render.
 * Everything is optional except `scope` so the palette degrades gracefully
 * before data loads.
 */
export interface ResolveSectionsInput {
	/** The active Scope tuple. */
	scope: PaletteScope;
	/** Recent rows (frecency-ranked): IA-MAP §6.1; the host caps at 4. */
	recent?: ReadonlyArray<PaletteRow>;
	/** Project recents for the switcher. */
	projectRecents?: ReadonlyArray<{ id: string; label: string }>;
	/** Federated-search hits for the current query. */
	federatedHits?: ReadonlyArray<FederatedHit>;
	/** Settings-search rows (every settings field by name). */
	settingsRows?: ReadonlyArray<PaletteRow>;
	/** Host action handlers for non-navigation rows. */
	handlers?: {
		onToggleTheme?: () => void;
		onDensityMode?: () => void;
		onShortcuts?: () => void;
	};
}

/** The maximum Recent rows the palette shows (IA-MAP §6.1: "4 entries"). */
export const RECENT_LIMIT = 4;

/**
 * Resolve the full ordered section list for a Scope. Returns sections in
 * `PALETTE_SECTION_ORDER`; the Step-actions section is present ONLY when a Step
 * is in scope. Empty sections (e.g. no recents yet) are dropped so the palette
 * never renders a bare header: but present sections always keep §6 order.
 */
export function resolvePaletteSections(input: ResolveSectionsInput): PaletteSection[] {
	const { scope } = input;
	const rowsBySection: Record<PaletteSectionId, PaletteRow[]> = {
		recent: (input.recent ?? []).slice(0, RECENT_LIMIT).map((row) => ({ ...row, section: "recent" })),
		"stage-nav": stageNavRows(scope),
		"project-switcher": projectSwitcherRows(scope, input.projectRecents),
		"step-actions": stepActionRows(scope),
		"federated-search": federatedSearchRows(input.federatedHits ?? []),
		"settings-search": (input.settingsRows ?? []).map((row) => ({ ...row, section: "settings-search" })),
		"workspace-theme": workspaceThemeRows(scope, input.handlers),
		help: helpRows(input.handlers),
	};

	return PALETTE_SECTION_ORDER
		.map((id) => ({ id, label: PALETTE_SECTION_LABEL[id], rows: rowsBySection[id] }))
		.filter((section) => section.rows.length > 0);
}

/**
 * The active-context chip text shown in the palette header (DESIGN.md §4.12
 * "Header chip shows active scope so menu never ambiguous"). Reads the Scope
 * tuple into one human string: `Plan · run_8f29a4c 3/8 · claude-opus-4.7`.
 */
export function paletteScopeChip(scope: PaletteScope): string {
	const parts: string[] = [STAGE_LABEL[scope.stage]];
	if (scope.projectLabel ?? scope.projectId) {
		parts.push(scope.projectLabel ?? String(scope.projectId));
	}
	if (scope.step) {
		const idx = scope.step.index && scope.step.total
			? ` ${scope.step.index}/${scope.step.total}`
			: "";
		parts.push(`${scope.step.title}${idx}`.trim());
	}
	if (scope.agent) parts.push(scope.agent);
	return parts.join(" · ");
}
