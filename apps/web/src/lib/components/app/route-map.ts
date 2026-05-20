/**
 * @module route-map
 *
 * Workspace / project / workflow-stage route model (`prd-web-stage-route-model`).
 *
 * IA-MAP.md §1 fixes the canonical URL grammar:
 *
 *   /<ws>/projects/<projId>/<stage>
 *
 * where `<stage>` is one of the six WorkflowStages (Capture, Plan, Build,
 * Review, Ship, Operate). Before this module the live web app routed by
 * feature buckets (`/boards`, `/planning`, `/runs`, `/artifacts`, `/doctor`)
 * and isolated preview pages — there was no route grammar the StageRail,
 * ScopeBar, and trace links could share.
 *
 * This module is the single source of truth for:
 *
 *  1. `STAGE_ORDER` / `WORKFLOW_STAGES` — the six canonical WorkflowStages.
 *  2. `stageRoute()` / `projectHomeRoute()` / `workspaceHomeRoute()` — builders
 *     that compose canonical IA-MAP §1 paths, so no surface hand-writes a
 *     stage URL.
 *  3. `LEGACY_ROUTE_MAP` — every pre-shell feature-bucket / preview route folder
 *     mapped to the WorkflowStage that now owns it. Old paths keep resolving
 *     (no 404 — migration-strategy.md value-preservation item 2); this map is
 *     the alias layer that lets the StageRail and ScopeBar present an old route
 *     as its canonical stage, and lets a redirect resolve an old path to its
 *     canonical stage home without breaking the still-rendering feature route.
 *  4. `canonicalStageFor()` — resolve any live pathname (canonical or legacy) to
 *     its WorkflowStage, so the shell chrome always shows an accurate stage.
 *  5. `STAGE_DEFAULT_SUB` — each stage's default sub-view, per IA-MAP §1.
 *  6. `withTrace()` — carry the `#trace=<id>` hash + filter query across a
 *     stage navigation (IA-MAP §1 "Trace ID survives as URL hash").
 *
 * Portfolio surfaces (`/projects`, `/search`, `/memory`, `/inbox`,
 * `/<ws>/dashboard`) are workspace-scoped and deliberately NOT project-scoped:
 * `PORTFOLIO_ROUTES` lists them so the route model never folds them under a
 * project. `isPortfolioPath()` is the guard.
 *
 * The companion crawl `apps/web/tests/design-e2e/routes.spec.ts` drives every
 * key in `LEGACY_ROUTE_MAP` and asserts each resolves `200|301|308`, never 404.
 */

import type { WorkflowStage } from "@fulcrum/ui-kit";

export type { WorkflowStage } from "@fulcrum/ui-kit";

/** The six WorkflowStages, left-to-right, per `apps/web/CONTEXT.md` + IA-MAP §1. */
export const STAGE_ORDER = [
	"capture",
	"plan",
	"build",
	"review",
	"ship",
	"operate",
] as const satisfies readonly WorkflowStage[];

/** A WorkflowStage with its human label — the canonical stage vocabulary. */
export interface WorkflowStageEntry {
	/** Canonical stage slug used in `/<ws>/projects/<projId>/<stage>`. */
	stage: WorkflowStage;
	/** Title-case label rendered by the StageRail / ScopeBar tab strip. */
	label: string;
}

/** Ordered stage entries; the StageRail and ScopeBar render this exact list. */
export const WORKFLOW_STAGES: readonly WorkflowStageEntry[] = [
	{ stage: "capture", label: "Capture" },
	{ stage: "plan", label: "Plan" },
	{ stage: "build", label: "Build" },
	{ stage: "review", label: "Review" },
	{ stage: "ship", label: "Ship" },
	{ stage: "operate", label: "Operate" },
] as const;

/** Type guard: is `value` one of the six canonical WorkflowStages? */
export function isWorkflowStage(value: string): value is WorkflowStage {
	return (STAGE_ORDER as readonly string[]).includes(value);
}

/**
 * Each stage's default sub-view (IA-MAP §1: "Build (default: board)",
 * "Operate (doctor default)", …). `stageRoute()` does not append these — they
 * are the canonical landing the stage workbench renders — but the StageRail
 * sub-nav and any redirect target reference them.
 */
export const STAGE_DEFAULT_SUB: Record<WorkflowStage, string> = {
	capture: "inbox",
	plan: "sessions",
	build: "board",
	review: "queue",
	ship: "artifacts",
	operate: "doctor",
} as const;

/* ── Canonical route builders (IA-MAP §1) ──────────────────────────────── */

/** `/<ws>` — workspace home. */
export function workspaceHomeRoute(ws: string): string {
	return `/${encodeURIComponent(ws)}`;
}

/** `/<ws>/projects` — the project list (Linear-style), a portfolio surface. */
export function projectListRoute(ws: string): string {
	return `/${encodeURIComponent(ws)}/projects`;
}

/** `/<ws>/projects/<projId>` — project home (Capture stage default). */
export function projectHomeRoute(ws: string, projId: string): string {
	return `/${encodeURIComponent(ws)}/projects/${encodeURIComponent(projId)}`;
}

/**
 * `/<ws>/projects/<projId>/<stage>` — the canonical stage workbench route.
 * This is the one grammar the StageRail, ScopeBar, and trace deep links share.
 */
export function stageRoute(ws: string, projId: string, stage: WorkflowStage): string {
	return `${projectHomeRoute(ws, projId)}/${stage}`;
}

/* ── Portfolio surfaces — workspace scope, never project-scoped ─────────── */

/**
 * Workspace-scoped routes that have NO active project. They hang off the
 * workspace root, never under `/projects/<projId>/`. IA-MAP §1 "Portfolio
 * (workspace scope, no project)". `apps/web/CONTEXT.md`: PortfolioSurface.
 */
export const PORTFOLIO_ROUTES = [
	"dashboard",
	"projects",
	"inbox",
	"search",
	"memory",
	"global-docs",
] as const;

/**
 * True when `pathname` is a portfolio (workspace-scope, no-project) surface.
 *
 * A portfolio surface has NO active project: `/<ws>/projects` (the project
 * list) is portfolio, but `/<ws>/projects/<projId>/...` is project-scoped — it
 * has a project, so it is not portfolio. The canonical project-scoped form is
 * therefore excluded explicitly.
 */
export function isPortfolioPath(pathname: string): boolean {
	const trimmed = pathname.replace(/^\/+|\/+$/g, "");
	const segments = trimmed.split("/");

	// `/<ws>/projects/<projId>[/...]` — project-scoped, never portfolio.
	if (segments[1] === "projects" && segments.length >= 3) {
		return false;
	}
	// `/<ws>/<portfolio>` — second segment is a known portfolio surface
	// (`/<ws>/projects` with no projId, `/<ws>/dashboard`, `/<ws>/inbox`, …).
	if (segments.length >= 2 && (PORTFOLIO_ROUTES as readonly string[]).includes(segments[1] ?? "")) {
		return true;
	}
	// Legacy flat portfolio paths (`/projects`, `/search`, `/memory`, `/inbox`).
	if (segments.length === 1 && (PORTFOLIO_ROUTES as readonly string[]).includes(segments[0] ?? "")) {
		return true;
	}
	return false;
}

/* ── Legacy route → canonical stage mapping ────────────────────────────── */

/**
 * Every pre-shell route folder under `apps/web/src/routes/` mapped to the
 * WorkflowStage that now owns it. The migration keeps each old path resolving
 * (the feature route still renders — no 404, no test breakage); this map is the
 * alias layer the shell chrome reads so an old path presents as its canonical
 * stage, and the `[ws]` route tree can redirect a bare project/stage path to a
 * concrete workbench.
 *
 * `null` means the route is workspace-scoped (portfolio / system / auth /
 * error / preview-tooling) and has no owning WorkflowStage — it is intentionally
 * outside project scope. The route-classification dispositions live in
 * `design-alignment/<cluster>.md` (owned by
 * `prd-cross-route-classification-completeness`); this map is the runtime
 * projection of the Capture→Operate stage column of that classification.
 */
export const LEGACY_ROUTE_MAP: Readonly<Record<string, WorkflowStage | null>> = {
	// ── Capture stage ──
	docs: "capture",
	"doc-labels": "capture",
	inbox: "capture",
	"editor-blockquote": "capture",
	// ── Plan stage ──
	planning: "plan",
	"plan-prompts": "plan",
	"plan-prototypes": "plan",
	"plan-review": "plan",
	"plan-session": "plan",
	// ── Build stage ──
	boards: "build",
	"build-board": "build",
	"build-graph": "build",
	"build-runs": "build",
	"build-timeline": "build",
	tasks: "build",
	"task-filters": "build",
	runs: "build",
	"run-cancel": "build",
	"run-cost-tracking": "build",
	"run-detail": "build",
	"run-fork": "build",
	"run-rate-limits": "build",
	"run-retry-policy": "build",
	"run-retry-prompt": "build",
	orchestration: "build",
	"agent-cost-meter": "build",
	"agent-dependency-board": "build",
	"agent-session-export": "build",
	"agent-session-fork": "build",
	"agent-session-timeline": "build",
	"agent-token-chart": "build",
	"agent-tool-inspector": "build",
	"streamed-message": "build",
	"view-controls": "build",
	"views-custom-fields": "build",
	"watch-list": "build",
	"mobile-runs": "build",
	// ── Review stage ──
	comments: "review",
	"comments-block-thread": "review",
	"review-search": "review",
	"review-templates": "review",
	// ── Ship stage ──
	artifacts: "ship",
	"ship-archive": "ship",
	// ── Operate stage ──
	doctor: "operate",
	audit: "operate",
	agents: "operate",
	"operate-alerts": "operate",
	"operate-mcp": "operate",
	inference: "operate",
	"inference-models": "operate",
	"skill-registry": "operate",
	"skill-detail": "operate",
	"mobile-observability": "operate",
	context: "operate",
	"cross-cutting-perf": "operate",
	// ── Workspace scope — no owning stage (portfolio / system / auth / preview) ──
	projects: null,
	search: null,
	memory: null,
	settings: null,
	"project-settings": null,
	repos: null,
	members: null,
	"member-remove": null,
	"space-permissions": null,
	"api-tokens": null,
	"ai-assist": null,
	palette: null,
	"palette-cmd-k": null,
	auth: null,
	"auth-flows": null,
	"auth-2fa-verify": null,
	"account-2fa-setup": null,
	onboarding: null,
	offline: null,
	"theme-picker": null,
	"agent-keyboard-shortcuts": null,
	"agent-notifications": null,
	"agent-window-controls": null,
	"notifications-empty": null,
	"notifications-inbox": null,
	"notifications-settings": null,
	"sessions-empty": null,
	"cross-cutting-mobile": null,
	"cross-cutting-motion": null,
	"cross-cutting-offline": null,
	"mobile-capture": null,
	"design-kit": null,
	"wave-0a-foundation": null,
};

/**
 * Resolve any live pathname — a canonical `/<ws>/projects/<projId>/<stage>`
 * URL or a legacy feature-bucket / preview path — to the WorkflowStage the
 * shell chrome should mark active. Returns `null` for workspace-scope routes
 * with no owning stage (portfolio / system / auth / error). Order:
 *
 *   1. Canonical `/<ws>/projects/<projId>/<stage>` — read the `<stage>` segment.
 *   2. Legacy path — first segment looked up in `LEGACY_ROUTE_MAP`.
 *   3. Otherwise `null`.
 */
export function canonicalStageFor(pathname: string): WorkflowStage | null {
	const trimmed = pathname.replace(/^\/+|\/+$/g, "");
	if (trimmed === "") return null;
	const segments = trimmed.split("/");

	// Canonical: /<ws>/projects/<projId>/<stage>[/...]
	if (segments[1] === "projects" && segments.length >= 4) {
		const candidate = segments[3] ?? "";
		if (isWorkflowStage(candidate)) return candidate;
		return null;
	}

	// Legacy flat path — first segment owns the lookup.
	const head = segments[0] ?? "";
	if (head in LEGACY_ROUTE_MAP) return LEGACY_ROUTE_MAP[head] ?? null;
	return null;
}

/* ── Trace + filter-state preservation across stage navigation ─────────── */

/**
 * Carry the trace hash and filter query from `currentUrl` onto `targetPath`.
 *
 * IA-MAP §1 URL invariants:
 *   - "Trace ID survives as URL hash: every route accepts `#trace=<id>`."
 *   - "Filter state survives via query params: `?status=open&view=board`."
 *
 * When the user moves between WorkflowStages via the StageRail or ScopeBar the
 * active trace must not be dropped. `currentUrl` may be a `URL`, a `Location`,
 * or any `{ search, hash }`-shaped object (so it works in SSR and the browser).
 *
 * The URL fragment (`#trace=…`) is never transmitted to the server — SvelteKit
 * throws on `event.url.hash` for that reason — and the browser already carries
 * a fragment forward across a redirect when the destination has none. So hash
 * access is guarded: server-side it is simply skipped (the browser preserves
 * it); client-side `location.hash` is read normally. Only the query string,
 * which IS sent to the server, is appended explicitly here.
 */
export function withTrace(
	targetPath: string,
	currentUrl: { search?: string; hash?: string } | URL | null | undefined,
): string {
	if (!currentUrl) return targetPath;
	const search = currentUrl.search ?? "";
	// Hash access throws on a SvelteKit server `event.url` — read it defensively.
	let hash = "";
	try {
		hash = currentUrl.hash ?? "";
	} catch {
		hash = "";
	}
	let next = targetPath;
	if (search && search !== "?" && !targetPath.includes("?")) {
		next += search.startsWith("?") ? search : `?${search}`;
	}
	if (hash && hash !== "#" && !targetPath.includes("#")) {
		next += hash.startsWith("#") ? hash : `#${hash}`;
	}
	return next;
}

/** Extract the trace id from a `#trace=<id>` hash, or `null` when absent. */
export function traceFromHash(hash: string | null | undefined): string | null {
	if (!hash) return null;
	const match = hash.match(/(?:^#?|&)trace=([^&]+)/);
	return match ? decodeURIComponent(match[1] ?? "") : null;
}

/**
 * A few legacy folders are layout-only — their renderable surface lives at a
 * sub-path, so the route-resolution crawl drives the sub-path rather than the
 * bare folder (driving the bare folder would 404, which is correct for a
 * layout-only folder but not a regression). Keyed by folder name.
 */
const LEGACY_RENDERABLE_PATH: Readonly<Record<string, string>> = {
	tasks: "/tasks/seed-task",
	context: "/context/preview",
	auth: "/auth/login",
};

/**
 * The list of pre-existing route paths the route-resolution crawl drives.
 * Every key of `LEGACY_ROUTE_MAP` contributes one path the crawl asserts
 * resolves `200|301|308` — never 404. Layout-only folders contribute their
 * renderable sub-path (`LEGACY_RENDERABLE_PATH`). Kept as a function so the
 * crawl spec and any disposition audit derive the same set from one map.
 */
export function legacyRoutePaths(): string[] {
	return Object.keys(LEGACY_ROUTE_MAP).map(
		(folder) => LEGACY_RENDERABLE_PATH[folder] ?? `/${folder}`,
	);
}
