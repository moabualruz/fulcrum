import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { loadDashboard } from "$lib/server/dashboard";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { stageRoute, withTrace } from "$lib/components/app/route-map.ts";

/**
 * Root `/`: the authenticated operator's default screen
 * (`prd-web-root-default-screen`, IA-MAP §3, `apps/web/CONTEXT.md`).
 *
 * The OD `index.html` canonizes a stage-shell default screen: the operator
 * lands inside their work, not on a metric report. So the root resolves by
 * Scope state:
 *
 *  - **An active project is set**: the cookie carries a project. The root
 *    `redirect`s (308) to that project's Capture WorkflowStage workbench
 *    `/<ws>/projects/<projId>/capture`: the first stage and the canonical
 *    project home (IA-MAP §1). The redirect goes through the shared
 *    `route-map.ts` grammar (`stageRoute`) so the StageRail, ScopeBar, and
 *    trace deep links all resolve the same path; `withTrace` carries the
 *    `#trace=<id>` hash + filter query so trace identity survives the hop.
 *
 *  - **No active project**: the root renders the portfolio Dashboard, a
 *    PortfolioSurface (`apps/web/CONTEXT.md`: "a workspace-scope route with no
 *    active Project: Dashboard, Projects list, …"). It re-homes the run
 *    counts, sync status, recent runs/docs/tasks, and project tiles that the
 *    retired metric dashboard used to carry: the data is relocated, not
 *    deleted (`migration-strategy.md` value-preservation item 4).
 *
 * The retired screen was an `<h1>Dashboard</h1>` over four zero-value
 * MetricCards (`00-executive-review.md` failure 5): a metric report shown as
 * the default screen. That heading + grid is gone; its widgets live on inside
 * the portfolio Dashboard surface below.
 */

/**
 * The workspace slug for the canonical `/<ws>/...` route grammar. The route
 * tree under `[ws]` is slug-agnostic (it passes `params.ws` through), so the
 * slug only has to be stable per workspace. It is derived from the session
 * org id; absent an org (local dev / unauthenticated) it falls back to the
 * same `local-workspace` default `workflow-api.ts` uses.
 */
function workspaceSlugFor(orgId: string | null | undefined): string {
	const source = (orgId ?? "").trim();
	if (source === "") return "local-workspace";
	return (
		source
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "local-workspace"
	);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const projectId = locals?.activeProjectId ?? null;

	// An active project is in Scope: land inside its Capture workbench.
	if (projectId !== null) {
		const ws = workspaceSlugFor(locals?.orgId);
		throw redirect(308, withTrace(stageRoute(ws, projectId, "capture"), url));
	}

	// No active project: render the portfolio Dashboard PortfolioSurface.
	// `loadDashboard` is called with no project id so the counters and lists
	// are workspace-wide: the same service call the retired root ran, kept
	// running (`migration-strategy.md` value-preservation item 1).
	return {
		activeProjectId: null,
		streamed: {
			dashboard: (async () => {
				const { em, ctx } = await requestServiceScope(locals, null);
				return await loadDashboard(em, ctx.orgId, null);
			})(),
		},
	};
};
