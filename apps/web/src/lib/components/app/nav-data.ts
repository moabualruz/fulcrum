import type { WorkflowStage } from "@fulcrum/ui-kit";

export type { WorkflowStage } from "@fulcrum/ui-kit";

/**
 * The canonical left-to-right WorkflowStage axis (DESIGN.md §3.1, IA-MAP.md §3).
 * The StageRail primitive owns the six-stage `WORKFLOW_STAGES` order; this module
 * supplies the production route each stage opens plus the route→stage mapping.
 */

/** A WorkflowStage entry the StageRail navigates: a stage id and the route it opens. */
export interface StageNavItem {
	/** The WorkflowStage this rail item represents. */
	stage: WorkflowStage;
	/** Production route the stage opens (always begins with "/"). */
	href: string;
}

/**
 * One stage → its production route. Capture is the workspace root `/`; the rest
 * open their stage workbench. Old feature-bucket routes redirect to these stage
 * homes via `prd-web-stage-route-model`; this map only fixes the rail targets.
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
 * to exactly one stage so the rail can show an accurate `aria-current` active
 * stage. Order matters: the first prefix that matches the pathname wins, so
 * longer/more-specific prefixes are listed before shorter ones. The literal
 * root `/` is handled separately by `stageForPath` (exact match only).
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
 * Resolve any pathname to the WorkflowStage whose rail item should read as
 * active. The workspace root `/` is the Capture stage; every other path falls
 * back to Capture only when no stage prefix matches.
 */
export function stageForPath(pathname: string): WorkflowStage {
	if (pathname === "/") return "capture";
	for (const [prefix, stage] of STAGE_ROUTE_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return stage;
	}
	return "capture";
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
 * The persistent non-stage groups the StageRail renders below the stage axis.
 * Group order is locked by `nav-items.test.ts`; reordering requires updating
 * the test snapshot.
 *
 * - `Workspace` preserves the former `Portfolio` group verbatim — portfolio
 *   destinations that travel with every stage, kept visually quiet so they do
 *   not compete with the workflow-stage axis.
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
