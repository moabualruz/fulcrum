import type { StageRailSubnavItem, WorkflowStage } from "@fulcrum/ui-kit";

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
 * One stage → its production route. Capture is the workspace root `/`; the rest
 * open their stage workbench. This is **data only** — the ScopeBar stage-tab
 * strip consumes it; the StageRail does not render it. Old feature-bucket routes
 * redirect to these stage homes via `prd-web-stage-route-model`.
 */
export const STAGE_NAV_ITEMS: readonly StageNavItem[] = [
	{ stage: "capture", href: "/" },
	{ stage: "plan", href: "/planning" },
	{ stage: "build", href: "/build-runs" },
	{ stage: "review", href: "/review-search" },
	{ stage: "ship", href: "/ship-archive" },
	{ stage: "operate", href: "/operate-mcp" },
] as const;

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
	["/review-search", "review"],
	["/review-templates", "review"],
	["/comments", "review"],
	// Ship stage
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
		{ id: "capture-inbox", label: "Inbox", href: "/inbox" },
		{ id: "capture-docs", label: "Docs", href: "/docs" },
	],
	plan: [
		{ id: "plan-sessions", label: "Sessions", href: "/plan-session" },
		{ id: "plan-reviews", label: "Reviews", href: "/plan-review" },
		{ id: "plan-prototypes", label: "Prototypes", href: "/plan-prototypes" },
		{ id: "plan-templates", label: "Templates", href: "/review-templates" },
		{ id: "plan-prompts", label: "Prompts", href: "/plan-prompts" },
	],
	build: [
		{ id: "build-board", label: "Board", href: "/build-board" },
		{ id: "build-graph", label: "Graph", href: "/build-graph" },
		{ id: "build-runs", label: "Runs", href: "/build-runs" },
		{ id: "build-timeline", label: "Timeline", href: "/build-timeline" },
	],
	review: [
		{ id: "review-search", label: "Workbench", href: "/review-search" },
		{ id: "review-comments", label: "Comments", href: "/comments" },
		{ id: "review-templates", label: "Templates", href: "/review-templates" },
	],
	ship: [{ id: "ship-archive", label: "Archive", href: "/ship-archive" }],
	operate: [
		{ id: "operate-doctor", label: "Doctor", href: "/doctor" },
		{ id: "operate-alerts", label: "Alerts", href: "/operate-alerts" },
		{ id: "operate-audit", label: "Audit", href: "/audit" },
	],
} as const;

/**
 * The sub-navigation the StageRail must render for a given active stage. Always
 * returns a non-empty list so the rail's primary group is never blank.
 */
export function subnavForStage(stage: WorkflowStage): readonly StageRailSubnavItem[] {
	return STAGE_SUBNAV[stage];
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
			{ id: "mcp", href: "/operate-mcp", label: "MCP", iconName: "Server" },
			{ id: "plugins", href: "/skill-registry", label: "Plugins", iconName: "Plug" },
		],
	},
] as const;

export const WORKSPACE_NAV_ITEMS: readonly NavItem[] =
	NAV_GROUPS.find((group) => group.label === "Workspace")?.items ?? [];

export const SYSTEM_NAV_ITEMS: readonly NavItem[] =
	NAV_GROUPS.find((group) => group.label === "System")?.items ?? [];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
