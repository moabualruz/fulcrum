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
 * and isolated preview pages: there was no route grammar the StageRail,
 * ScopeBar, and trace links could share.
 *
 * This module is the single source of truth for:
 *
 *  1. `STAGE_ORDER` / `WORKFLOW_STAGE_ENTRIES`: the six canonical WorkflowStages.
 *  2. `stageRoute()` / `projectHomeRoute()` / `workspaceHomeRoute()`: builders
 *     that compose canonical IA-MAP §1 paths, so no surface hand-writes a
 *     stage URL.
 *  3. `LEGACY_ROUTE_MAP`: every pre-shell feature-bucket / preview route folder
 *     mapped to the WorkflowStage that now owns it. Old paths keep resolving
 *     (no 404: migration-strategy.md value-preservation item 2); this map is
 *     the alias layer that lets the StageRail and ScopeBar present an old route
 *     as its canonical stage, and lets a redirect resolve an old path to its
 *     canonical stage home without breaking the still-rendering feature route.
 *  4. `canonicalStageFor()`: resolve any live pathname (canonical or legacy) to
 *     its WorkflowStage, so the shell chrome always shows an accurate stage.
 *  5. `STAGE_DEFAULT_SUB`: each stage's default sub-view, per IA-MAP §1.
 *  6. `withTrace()`: carry the `#trace=<id>` hash + filter query across a
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

import { WorkflowStageValues, type WorkflowStage } from "@fulcrum/shared-dto";

export type { WorkflowStage } from "@fulcrum/shared-dto";

/** The six WorkflowStages, left-to-right, per `apps/web/CONTEXT.md` + IA-MAP §1. */
export const STAGE_ORDER = WorkflowStageValues satisfies readonly WorkflowStage[];

/** A WorkflowStage with its human label: the canonical stage vocabulary. */
export interface WorkflowStageEntry {
	/** Canonical stage slug used in `/<ws>/projects/<projId>/<stage>`. */
	stage: WorkflowStage;
	/** Title-case label rendered by the StageRail / ScopeBar tab strip. */
	label: string;
}

/** Ordered stage entries; the StageRail and ScopeBar render this exact list. */
export const WORKFLOW_STAGE_ENTRIES: readonly WorkflowStageEntry[] = [
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
 * "Operate (doctor default)", …). `stageRoute()` does not append these: they
 * are the canonical landing the stage workbench renders: but the StageRail
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

/** Canonical one-segment IA subroutes owned by the dynamic stage route. */
export const STAGE_SUBROUTES: Readonly<Record<WorkflowStage, readonly string[]>> = {
	capture: ["inbox", "docs", "drafts", "promoted"],
	plan: ["missions", "sessions", "review", "prompts", "prototypes", "templates"],
	build: ["board", "list", "table", "calendar", "gantt", "timeline", "graph", "runs", "cycles", "modules"],
	review: ["queue", "search", "comments", "templates", "qa", "uat", "e2e"],
	ship: ["artifacts", "archive", "reports", "memory"],
	operate: ["doctor", "runs", "inbox", "audit", "error-logs", "telemetry", "settings", "alerts", "mcp", "plugins"],
} as const;

export function isKnownStageSubroute(stage: WorkflowStage, sub: string): boolean {
	return STAGE_SUBROUTES[stage].includes(sub);
}

export function isReviewDetailSubroute(sub: string): boolean {
	return !isKnownStageSubroute("review", sub);
}

export function isShipArtifactSubroute(sub: string): boolean {
	return !isKnownStageSubroute("ship", sub);
}

/**
 * Existing OD-fidelity flat workbench route each project-scoped stage projects
 * to until those workbenches are physically nested under `/<ws>/projects/...`.
 */
export const STAGE_WORKBENCH_ROUTE: Record<WorkflowStage, string> = {
	capture: "/",
	plan: "/plan-session",
	build: "/build-board",
	review: "/review",
	ship: "/ship",
	operate: "/doctor",
} as const;

export const DEFAULT_CANONICAL_WORKSPACE = "mkh";
export const DEFAULT_CANONICAL_PROJECT = "fulcrum";

export type StageSubroute = {
	stage: WorkflowStage;
	sub?: string;
	detail?: string;
};

const LEGACY_CANONICAL_TARGETS: Readonly<Record<string, StageSubroute>> = {
	"plan-session": { stage: "plan" },
	"plan-review": { stage: "plan", sub: "review" },
	"plan-prompts": { stage: "plan", sub: "prompts" },
	"plan-prototypes": { stage: "plan", sub: "prototypes" },
	"plan-templates": { stage: "plan", sub: "templates" },
	"build-board": { stage: "build", sub: "board" },
	"build-list": { stage: "build", sub: "list" },
	"build-graph": { stage: "build", sub: "graph" },
	"build-runs": { stage: "build", sub: "runs" },
	"build-timeline": { stage: "build", sub: "gantt" },
	"mobile-runs": { stage: "build", sub: "runs" },
	"run-cancel": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-cost-tracking": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-detail": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-fork": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-rate-limits": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-retry-policy": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	"run-retry-prompt": { stage: "build", sub: "runs", detail: "run_56e3d12" },
	review: { stage: "review" },
	"review-queue": { stage: "review" },
	"review-search": { stage: "review", sub: "search" },
	"review-templates": { stage: "review", sub: "templates" },
	ship: { stage: "ship" },
	"ship-archive": { stage: "ship", sub: "archive" },
	doctor: { stage: "operate", sub: "doctor" },
	operate: { stage: "operate", sub: "doctor" },
	"operate-alerts": { stage: "operate", sub: "alerts" },
	"operate-mcp": { stage: "operate", sub: "mcp" },
	"operate-plugins": { stage: "operate", sub: "plugins" },
	"operate-telemetry": { stage: "operate", sub: "telemetry" },
	"mobile-capture": { stage: "capture" },
};

/* ── Canonical route builders (IA-MAP §1) ──────────────────────────────── */

/** `/<ws>`: workspace home. */
export function workspaceHomeRoute(ws: string): string {
	return `/${encodeURIComponent(ws)}`;
}

/** `/<ws>/projects`: the project list (Linear-style), a portfolio surface. */
export function projectListRoute(ws: string): string {
	return `/${encodeURIComponent(ws)}/projects`;
}

/** `/<ws>/projects/<projId>`: project home (Capture stage default). */
export function projectHomeRoute(ws: string, projId: string): string {
	return `/${encodeURIComponent(ws)}/projects/${encodeURIComponent(projId)}`;
}

/**
 * `/<ws>/projects/<projId>/<stage>`: the canonical stage workbench route.
 * This is the one grammar the StageRail, ScopeBar, and trace deep links share.
 */
export function stageRoute(ws: string, projId: string, stage: WorkflowStage): string {
	return `${projectHomeRoute(ws, projId)}/${stage}`;
}

export function stageSubroute(ws: string, projId: string, stage: WorkflowStage, sub: string): string {
	return `${stageRoute(ws, projId, stage)}/${encodeURIComponent(sub)}`;
}

export function buildRunDetailRoute(ws: string, projId: string, runId: string): string {
	return `${stageSubroute(ws, projId, "build", "runs")}/${encodeURIComponent(runId)}`;
}

export function legacyCanonicalTarget(pathname: string): StageSubroute | null {
	const [head, second] = pathname.replace(/^\/+|\/+$/g, "").split("/");
	if (!head) return null;
	if (head === "review" && second) return { stage: "review", sub: second };
	return LEGACY_CANONICAL_TARGETS[head] ?? null;
}

export function canonicalRouteForLegacyPath(
	pathname: string,
	ws = DEFAULT_CANONICAL_WORKSPACE,
	projId = DEFAULT_CANONICAL_PROJECT,
): string | null {
	const target = legacyCanonicalTarget(pathname);
	if (!target) return null;
	if (target.stage === "build" && target.sub === "runs" && target.detail) {
		return buildRunDetailRoute(ws, projId, target.detail);
	}
	return target.sub ? stageSubroute(ws, projId, target.stage, target.sub) : stageRoute(ws, projId, target.stage);
}

/* ── Portfolio surfaces: workspace scope, never project-scoped ─────────── */

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
 * list) is portfolio, but `/<ws>/projects/<projId>/...` is project-scoped: it
 * has a project, so it is not portfolio. The canonical project-scoped form is
 * therefore excluded explicitly.
 */
export function isPortfolioPath(pathname: string): boolean {
	const trimmed = pathname.replace(/^\/+|\/+$/g, "");
	const segments = trimmed.split("/");

	// `/<ws>/projects/<projId>[/...]`: project-scoped, never portfolio.
	if (segments[1] === "projects" && segments.length >= 3) {
		return false;
	}
	// `/<ws>/<portfolio>`: second segment is a known portfolio surface
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
 * (the feature route still renders: no 404, no test breakage); this map is the
 * alias layer the shell chrome reads so an old path presents as its canonical
 * stage, and the `[ws]` route tree can redirect a bare project/stage path to a
 * concrete workbench.
 *
 * `null` means the route is workspace-scoped (portfolio / system / auth /
 * error / preview-tooling) and has no owning WorkflowStage: it is intentionally
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
	"review-queue": "review",
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
	"operate-plugins": "operate",
	operate: "operate",
	inference: "operate",
	"inference-models": "operate",
	"skill-registry": "operate",
	"skill-detail": "operate",
	"mobile-observability": "operate",
	context: "operate",
	"cross-cutting-perf": "operate",
	// ── Workspace scope: no owning stage (portfolio / system / auth / preview) ──
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

export type RouteCoverageKind =
	| "legacy-map"
	| "canonical-current"
	| "internal"
	| "server-endpoint"
	| "deferred/kept-with-reason";

export interface CurrentRouteCoverageEntry {
	/** How the current top-level route folder is accounted for by the migration crawl. */
	classification: RouteCoverageKind;
	/** Owning WorkflowStage when the route participates in the project-stage model. */
	stage: WorkflowStage | null;
	/** Human-readable reason; kept in source so the route crawl is replayable. */
	reason: string;
}

/**
 * Exhaustive route-tree coverage manifest for the current `apps/web/src/routes`
 * folders. `LEGACY_ROUTE_MAP` remains the old-alias resolution layer; this
 * manifest separately proves every current top-level UI route is either covered
 * by that legacy map, a canonical survivor, internal tooling, a server endpoint,
 * or an explicitly deferred/kept route with a reason.
 */
export const CURRENT_ROUTE_COVERAGE = {
	"account-2fa-setup": { classification: "legacy-map", stage: null, reason: "account security setup route kept outside project WorkflowStage scope" },
	"agent-cost-meter": { classification: "legacy-map", stage: "build", reason: "legacy agent-run cost preview resolves under Build run observability" },
	"agent-dependency-board": { classification: "legacy-map", stage: "build", reason: "legacy dependency board preview resolves under Build work management" },
	"agent-keyboard-shortcuts": { classification: "legacy-map", stage: null, reason: "system shortcut preview kept outside project WorkflowStage scope" },
	"agent-notifications": { classification: "legacy-map", stage: null, reason: "notification preview kept as workspace/system route until notifications PRD re-homes it" },
	"agent-session-export": { classification: "legacy-map", stage: "build", reason: "legacy session export surface resolves under Build run detail" },
	"agent-session-fork": { classification: "legacy-map", stage: "build", reason: "legacy session fork surface resolves under Build run detail" },
	"agent-session-timeline": { classification: "legacy-map", stage: "build", reason: "legacy session timeline resolves under Build live-session pane" },
	"agent-token-chart": { classification: "legacy-map", stage: "build", reason: "legacy token chart resolves under Build run observability" },
	"agent-tool-inspector": { classification: "legacy-map", stage: "build", reason: "legacy tool inspector resolves under Build run observability" },
	"agent-window-controls": { classification: "legacy-map", stage: null, reason: "desktop/window control preview kept outside project WorkflowStage scope" },
	"agents": { classification: "legacy-map", stage: "operate", reason: "legacy agents route resolves under Operate agent management" },
	"ai-assist": { classification: "legacy-map", stage: null, reason: "global AI Assist surface kept as shell/system route" },
	"api-tokens": { classification: "legacy-map", stage: null, reason: "settings/security route kept outside project WorkflowStage scope" },
	"artifacts": { classification: "legacy-map", stage: "ship", reason: "legacy artifact manager resolves under Ship release/archive work" },
	"audit": { classification: "legacy-map", stage: "operate", reason: "legacy audit route resolves under Operate doctor/audit work" },
	"auth": { classification: "legacy-map", stage: null, reason: "auth layout route renders through /auth/login and stays pre-shell" },
	"auth-2fa-verify": { classification: "legacy-map", stage: null, reason: "auth verification route stays pre-shell" },
	"auth-flows": { classification: "legacy-map", stage: null, reason: "auth-flow preview stays pre-shell" },
	"boards": { classification: "legacy-map", stage: "build", reason: "legacy board route resolves under Build board" },
	"build-board": { classification: "legacy-map", stage: "build", reason: "flat Build board OD preview resolves under Build" },
	"build-graph": { classification: "legacy-map", stage: "build", reason: "flat Build graph OD preview resolves under Build" },
	"build-list": { classification: "canonical-current", stage: "build", reason: "current Build list survivor route; not an old alias" },
	"build-runs": { classification: "legacy-map", stage: "build", reason: "flat Build runs OD preview resolves under Build" },
	"build-timeline": { classification: "legacy-map", stage: "build", reason: "flat Build timeline OD preview resolves under Build" },
	"comments": { classification: "legacy-map", stage: "review", reason: "legacy comments route resolves under Review annotation work" },
	"comments-block-thread": { classification: "legacy-map", stage: "review", reason: "legacy anchored-thread preview resolves under Review" },
	"context": { classification: "legacy-map", stage: "operate", reason: "layout-only route renders through /context/preview and resolves under Operate" },
	"cross-cutting-mobile": { classification: "legacy-map", stage: null, reason: "mobile safe-area preview retained as cross-cutting design proof" },
	"cross-cutting-motion": { classification: "legacy-map", stage: null, reason: "motion-contract preview retained as cross-cutting design proof" },
	"cross-cutting-offline": { classification: "legacy-map", stage: null, reason: "offline-state preview retained until shell connection state owns it" },
	"cross-cutting-perf": { classification: "legacy-map", stage: "operate", reason: "performance preview resolves under Operate telemetry/diagnostics" },
	"design-kit": { classification: "internal", stage: null, reason: "ui-kit fixture route for design-e2e, not product navigation" },
	"doc-labels": { classification: "legacy-map", stage: "capture", reason: "legacy doc labels route resolves under Capture docs" },
	"docs": { classification: "legacy-map", stage: "capture", reason: "legacy docs route resolves under Capture" },
	"doctor": { classification: "legacy-map", stage: "operate", reason: "legacy doctor route resolves under Operate" },
	"editor-blockquote": { classification: "legacy-map", stage: "capture", reason: "editor block preview resolves under Capture editor work" },
	"inbox": { classification: "legacy-map", stage: "capture", reason: "legacy inbox path resolves under Capture intake until notification re-home completes" },
	"inference": { classification: "legacy-map", stage: "operate", reason: "legacy inference route resolves under Operate model management" },
	"inference-models": { classification: "legacy-map", stage: "operate", reason: "legacy inference model route resolves under Operate model management" },
	"member-remove": { classification: "legacy-map", stage: null, reason: "member management route kept as workspace/system route" },
	"members": { classification: "legacy-map", stage: null, reason: "member management route kept as workspace/system route" },
	"memory": { classification: "legacy-map", stage: null, reason: "portfolio Memory route has no active project stage" },
	"mobile-capture": { classification: "legacy-map", stage: null, reason: "mobile capture preview deferred as responsive Capture state" },
	"mobile-observability": { classification: "legacy-map", stage: "operate", reason: "mobile observability preview resolves under Operate" },
	"mobile-runs": { classification: "legacy-map", stage: "build", reason: "mobile runs preview resolves under Build" },
	"notifications-empty": { classification: "legacy-map", stage: null, reason: "empty notification state retained until notifications PRD owns it" },
	"notifications-inbox": { classification: "legacy-map", stage: null, reason: "workspace notifications inbox kept outside project stage scope" },
	"notifications-settings": { classification: "legacy-map", stage: null, reason: "workspace notifications settings kept outside project stage scope" },
	"offline": { classification: "legacy-map", stage: null, reason: "offline route kept until shell connection banner owns the state" },
	"onboarding": { classification: "legacy-map", stage: null, reason: "first-run route is pre-shell and outside project WorkflowStage scope" },
	"operate-alerts": { classification: "legacy-map", stage: "operate", reason: "flat Operate alerts OD preview resolves under Operate" },
	"operate-mcp": { classification: "legacy-map", stage: "operate", reason: "flat Operate MCP OD preview resolves under Operate" },
	"operate": { classification: "legacy-map", stage: "operate", reason: "flat Operate default alias resolves under Operate doctor workbench" },
	"operate-plugins": { classification: "legacy-map", stage: "operate", reason: "flat Operate plugin OD preview resolves under Operate" },
	"operate-telemetry": { classification: "canonical-current", stage: "operate", reason: "current Operate telemetry survivor route; not an old alias" },
	"orchestration": { classification: "legacy-map", stage: "build", reason: "legacy orchestration route resolves under Build" },
	"palette": { classification: "legacy-map", stage: null, reason: "global CommandPalette route kept as shell/system preview" },
	"palette-cmd-k": { classification: "legacy-map", stage: null, reason: "global CommandPalette shortcut preview kept as shell/system route" },
	"plan-prompts": { classification: "legacy-map", stage: "plan", reason: "flat Plan prompts OD preview resolves under Plan" },
	"plan-prototypes": { classification: "legacy-map", stage: "plan", reason: "flat Plan prototypes OD preview resolves under Plan" },
	"plan-review": { classification: "legacy-map", stage: "plan", reason: "flat Plan review OD preview resolves under Plan" },
	"plan-session": { classification: "legacy-map", stage: "plan", reason: "flat Plan session OD preview resolves under Plan" },
	"plan-templates": { classification: "canonical-current", stage: "plan", reason: "current Plan templates survivor route; not an old alias" },
	"planning": { classification: "legacy-map", stage: "plan", reason: "legacy planning route resolves under Plan" },
	"project-settings": { classification: "legacy-map", stage: null, reason: "project settings route kept as workspace/project system route" },
	"projects": { classification: "legacy-map", stage: null, reason: "portfolio project list has no active project stage" },
	"repos": { classification: "legacy-map", stage: null, reason: "repository management route kept as workspace/system route" },
	"review": { classification: "canonical-current", stage: "review", reason: "current Review queue/workbench survivor route; not an old alias" },
	"review-queue": { classification: "legacy-map", stage: "review", reason: "flat Review queue alias resolves under Review queue workbench" },
	"review-search": { classification: "legacy-map", stage: "review", reason: "legacy review search route resolves under Review" },
	"review-templates": { classification: "legacy-map", stage: "review", reason: "legacy review templates route resolves under Review" },
	"run-cancel": { classification: "legacy-map", stage: "build", reason: "legacy run cancel route resolves under Build run operations" },
	"run-cost-tracking": { classification: "legacy-map", stage: "build", reason: "legacy run cost route resolves under Build run operations" },
	"run-detail": { classification: "legacy-map", stage: "build", reason: "legacy run detail route resolves under Build run operations" },
	"run-fork": { classification: "legacy-map", stage: "build", reason: "legacy run fork route resolves under Build run operations" },
	"run-rate-limits": { classification: "legacy-map", stage: "build", reason: "legacy run rate-limit route resolves under Build run operations" },
	"run-retry-policy": { classification: "legacy-map", stage: "build", reason: "legacy retry-policy route resolves under Build run operations" },
	"run-retry-prompt": { classification: "legacy-map", stage: "build", reason: "legacy retry-prompt route resolves under Build run operations" },
	"runs": { classification: "legacy-map", stage: "build", reason: "legacy runs route resolves under Build" },
	"search": { classification: "legacy-map", stage: null, reason: "portfolio Search route has no active project stage" },
	"sessions-empty": { classification: "legacy-map", stage: null, reason: "empty sessions state retained until stage workbenches own it" },
	"settings": { classification: "legacy-map", stage: null, reason: "workspace SettingsSystemSurface has no active project stage" },
	"ship": { classification: "canonical-current", stage: "ship", reason: "current Ship survivor route; not an old alias" },
	"ship-archive": { classification: "legacy-map", stage: "ship", reason: "legacy ship archive route resolves under Ship" },
	"skill-detail": { classification: "legacy-map", stage: "operate", reason: "legacy skill detail route resolves under Operate" },
	"skill-registry": { classification: "legacy-map", stage: "operate", reason: "legacy skill registry route resolves under Operate" },
	"space-permissions": { classification: "legacy-map", stage: null, reason: "workspace permissions route kept as workspace/system route" },
	"streamed-message": { classification: "legacy-map", stage: "build", reason: "legacy streamed-message preview resolves under Build" },
	"task-filters": { classification: "legacy-map", stage: "build", reason: "legacy task filters route resolves under Build" },
	"tasks": { classification: "legacy-map", stage: "build", reason: "layout-only route renders through /tasks/seed-task and resolves under Build" },
	"theme-picker": { classification: "legacy-map", stage: null, reason: "theme picker preview kept as workspace/system route" },
	"view-controls": { classification: "legacy-map", stage: "build", reason: "legacy view controls route resolves under Build" },
	"views-custom-fields": { classification: "legacy-map", stage: "build", reason: "legacy custom-fields route resolves under Build" },
	"watch-list": { classification: "legacy-map", stage: "build", reason: "legacy watch list route resolves under Build" },
	"wave-0a-foundation": { classification: "internal", stage: null, reason: "internal recovery preview route, not product navigation" },
	"workspace": { classification: "deferred/kept-with-reason", stage: null, reason: "workspace-scoped survivor kept outside project WorkflowStage scope until portfolio routing PRD owns it" },
} as const satisfies Readonly<Record<string, CurrentRouteCoverageEntry>>;

/**
 * Resolve any live pathname: a canonical `/<ws>/projects/<projId>/<stage>`
 * URL or a legacy feature-bucket / preview path: to the WorkflowStage the
 * shell chrome should mark active. Returns `null` for workspace-scope routes
 * with no owning stage (portfolio / system / auth / error). Order:
 *
 *   1. Canonical `/<ws>/projects/<projId>/<stage>`: read the `<stage>` segment.
 *   2. Legacy path: first segment looked up in `LEGACY_ROUTE_MAP`.
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

	// Legacy flat path: first segment owns the lookup.
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
 * The URL fragment (`#trace=…`) is never transmitted to the server: SvelteKit
 * throws on `event.url.hash` for that reason: and the browser already carries
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
	// Hash access throws on a SvelteKit server `event.url`: read it defensively.
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
 * A few legacy folders are layout-only: their renderable surface lives at a
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
 * resolves `200|301|308`: never 404. Layout-only folders contribute their
 * renderable sub-path (`LEGACY_RENDERABLE_PATH`). Kept as a function so the
 * crawl spec and any disposition audit derive the same set from one map.
 */
export function legacyRoutePaths(): string[] {
	return Object.keys(LEGACY_ROUTE_MAP).map(
		(folder) => LEGACY_RENDERABLE_PATH[folder] ?? `/${folder}`,
	);
}
