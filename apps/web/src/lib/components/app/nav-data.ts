import type { StageRailSubnavItem, WorkflowStage } from "@fulcrum/ui-kit";
import {
	canonicalStageFor,
	DEFAULT_CANONICAL_PROJECT,
	DEFAULT_CANONICAL_WORKSPACE,
	stageRoute,
	stageSubroute,
} from "./route-map.ts";

export type { WorkflowStage } from "@fulcrum/ui-kit";

/**
 * Navigation data for the OD shell (DESIGN.md §3.1, IA-MAP.md §3).
 *
 * Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the six-stage
 * Capture→Operate workflow axis belongs to the **ScopeBar tab strip**, not the
 * StageRail. The StageRail renders the *active stage's sub-navigation* plus the
 * persistent Workspace and System groups (the OD `desktop-shell.html` rail
 * replica). This module therefore exposes two distinct things:
 *
 *  1. `STAGE_NAV_ITEMS` + `stageForPath` — the route↔stage mapping kept as
 *     **data** for the ScopeBar to consume; it is never rendered as rail items.
 *  2. `STAGE_SUBNAV` + `subnavForStage` — the per-stage sub-navigation the
 *     StageRail renders for whichever stage is active.
 */

/** A WorkflowStage entry the ScopeBar tab strip navigates: a stage id and the route it opens. */
export interface StageNavItem {
	/** The WorkflowStage this entry represents. */
	stage: WorkflowStage;
	/** Production route the stage opens (always begins with "/"). */
	href: string;
}

/**
 * One stage → its default canonical project-scoped route. Shell consumers with
 * live scope call `stageNavItemsForScope()` so the same IA route grammar drives
 * ScopeBar chords and mobile tabs. Old feature-bucket routes are redirects only.
 */
export const STAGE_NAV_ITEMS: readonly StageNavItem[] = [
	{ stage: "capture", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "capture") },
	{ stage: "plan", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan") },
	{ stage: "build", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "build") },
	{ stage: "review", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "review") },
	{ stage: "ship", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "ship") },
	{ stage: "operate", href: stageRoute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate") },
] as const;

export function stageNavItemsForScope(ws: string, projId: string): readonly StageNavItem[] {
	return STAGE_NAV_ITEMS.map((item) => ({
		stage: item.stage,
		href: stageRoute(ws, projId, item.stage),
	}));
}

/**
 * Route-prefix → WorkflowStage mapping. Every pre-existing destination resolves
 * to exactly one stage so the ScopeBar can show an accurate active stage and the
 * StageRail can pick the right sub-navigation. Order matters: the first prefix
 * that matches the pathname wins, so longer/more-specific prefixes are listed
 * before shorter ones. The literal root `/` is handled separately by
 * `stageForPath` (exact match only).
 *
 * No nav destination is dropped by the migration: the old feature-bucket and
 * System routes (`/boards`, `/docs`, `/runs`, `/artifacts`, `/agents`,
 * `/orchestration`, `/audit`, `/doctor`) keep resolving and each maps to the
 * stage that now owns it. Route aliases/redirects are owned by
 * `prd-web-stage-route-model`; this map only drives active-stage indication.
 */
const STAGE_ROUTE_PREFIXES: ReadonlyArray<readonly [string, WorkflowStage]> = [
	// Plan stage
	["/planning", "plan"],
	["/plan-prompts", "plan"],
	["/plan-prototypes", "plan"],
	["/plan-review", "plan"],
	["/plan-session", "plan"],
	["/docs", "plan"],
	// Build stage
	["/build-board", "build"],
	["/build-graph", "build"],
	["/build-runs", "build"],
	["/build-timeline", "build"],
	["/boards", "build"],
	["/tasks", "build"],
	["/runs", "build"],
	["/orchestration", "build"],
	// Review stage
	["/review", "review"],
	["/review-search", "review"],
	["/review-templates", "review"],
	["/comments", "review"],
	// Ship stage
	["/ship", "ship"],
	["/ship-archive", "ship"],
	["/artifacts", "ship"],
	// Operate stage
	["/operate-alerts", "operate"],
	["/operate-mcp", "operate"],
	["/agents", "operate"],
	["/audit", "operate"],
	["/doctor", "operate"],
	["/inference", "operate"],
] as const;

/**
 * Resolve any pathname to the WorkflowStage whose ScopeBar tab should read as
 * active. The workspace root `/` is the Capture stage; every other path falls
 * back to Capture only when no stage prefix matches. This resolver is consumed
 * by the ScopeBar (active tab) and by `AppSidebar` (active-stage sub-nav).
 */
export function stageForPath(pathname: string): WorkflowStage {
	const canonicalStage = canonicalStageFor(pathname);
	if (canonicalStage) return canonicalStage;
	if (pathname === "/") return "capture";
	for (const [prefix, stage] of STAGE_ROUTE_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return stage;
	}
	return "capture";
}

/**
 * Per-stage sub-navigation the StageRail renders for the active stage — the OD
 * `desktop-shell.html` rail replica (`Plan` → `Sessions / Reviews / Prototypes /
 * Templates / Prompts`). Each entry's `href` resolves to a real production route
 * so no destination 404s; the IA-MAP §1 stage route grammar is the source.
 */
export const STAGE_SUBNAV: Record<WorkflowStage, readonly StageRailSubnavItem[]> = {
	capture: [
		{ id: "capture-inbox", label: "Inbox", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "capture", "inbox") },
		{ id: "capture-docs", label: "Docs", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "capture", "docs") },
	],
	plan: [
		{ id: "plan-sessions", label: "Sessions", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan", "sessions") },
		{ id: "plan-reviews", label: "Reviews", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan", "review") },
		{ id: "plan-prototypes", label: "Prototypes", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan", "prototypes") },
		{ id: "plan-templates", label: "Templates", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan", "templates") },
		{ id: "plan-prompts", label: "Prompts", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "plan", "prompts") },
	],
	build: [
		{ id: "build-board", label: "Board", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "build", "board") },
		{ id: "build-graph", label: "Graph", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "build", "graph") },
		{ id: "build-runs", label: "Runs", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "build", "runs") },
		{ id: "build-timeline", label: "Timeline", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "build", "timeline") },
	],
	review: [
		{ id: "review-queue", label: "Queue", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "review", "queue") },
		{ id: "review-search", label: "Search", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "review", "search") },
		{ id: "review-comments", label: "Comments", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "review", "comments") },
		{ id: "review-templates", label: "Templates", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "review", "templates") },
	],
	ship: [
		{ id: "ship-artifacts", label: "Artifacts", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "ship", "artifacts") },
		{ id: "ship-archive", label: "Archive", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "ship", "archive") },
	],
	operate: [
		{ id: "operate-doctor", label: "Doctor", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate", "doctor") },
		{ id: "operate-alerts", label: "Alerts", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate", "alerts") },
		{ id: "operate-audit", label: "Audit", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate", "telemetry") },
	],
} as const;

/**
 * The sub-navigation the StageRail must render for a given active stage. Always
 * returns a non-empty list so the rail's primary group is never blank.
 */
export function subnavForStage(stage: WorkflowStage): readonly StageRailSubnavItem[] {
	return STAGE_SUBNAV[stage];
}

export function subnavForStageScope(
	stage: WorkflowStage,
	ws: string,
	projId: string,
): readonly StageRailSubnavItem[] {
	return STAGE_SUBNAV[stage].map((item) => {
		const sub = item.id.replace(`${stage}-`, "");
		return {
			...item,
			href: stageSubroute(ws, projId, stage, sub),
		};
	});
}

export const LUCIDE_ICON_NAMES = [
	"Activity",
	"BookOpen",
	"FileText",
	"Folder",
	"Plug",
	"Search",
	"Server",
	"Settings",
] as const;

export type LucideIconName = (typeof LUCIDE_ICON_NAMES)[number];

export interface NavItem {
	/** Absolute path the link routes to (always begins with "/"). */
	href: string;
	/** Visible text rendered next to the icon. */
	label: string;
	/** Lookup key into `LUCIDE_ICONS`. */
	iconName: LucideIconName;
	/** Stable id used as the StageRail workspace/system item key + data attribute. */
	id: string;
}

export interface NavGroup {
	label: "Workspace" | "System";
	items: readonly NavItem[];
}

/**
 * The persistent non-stage groups the StageRail renders below the active-stage
 * sub-navigation. Group order is locked by `nav-items.test.ts`; reordering
 * requires updating the test snapshot.
 *
 * - `Workspace` preserves the former `Portfolio` group verbatim — portfolio
 *   destinations that travel with every stage, kept visually quiet so they do
 *   not compete with the active-stage sub-navigation.
 * - `System` re-points to `Settings · Knowledge · MCP · Plugins` per
 *   IA-MAP.md §3 / DESIGN.md §3.1.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
	{
		label: "Workspace",
		items: [
			{ id: "projects", href: "/projects", label: "All projects", iconName: "Folder" },
			{ id: "search", href: "/search", label: "Search", iconName: "Search" },
			{ id: "memory", href: "/memory", label: "Memory", iconName: "FileText" },
			{ id: "context", href: "/context/preview", label: "Context", iconName: "FileText" },
		],
	},
	{
		label: "System",
		items: [
				{ id: "settings", href: "/settings", label: "Settings", iconName: "Settings" },
				{ id: "knowledge", href: "/memory", label: "Knowledge", iconName: "BookOpen" },
				{ id: "mcp", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate", "mcp"), label: "MCP", iconName: "Server" },
				{ id: "plugins", href: stageSubroute(DEFAULT_CANONICAL_WORKSPACE, DEFAULT_CANONICAL_PROJECT, "operate", "plugins"), label: "Plugins", iconName: "Plug" },
			],
		},
	] as const;

export const WORKSPACE_NAV_ITEMS: readonly NavItem[] =
	NAV_GROUPS.find((group) => group.label === "Workspace")?.items ?? [];

export const SYSTEM_NAV_ITEMS: readonly NavItem[] =
	NAV_GROUPS.find((group) => group.label === "System")?.items ?? [];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
