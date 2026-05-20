import type { PageServerLoad } from "./$types";
import { listProjectRows } from "@work-management/interface/project-lifecycle.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

/**
 * `/<ws>/projects` — the canonical workspace-scoped project list (IA-MAP §1
 * "Portfolio — workspace scope, no project"). This is a PortfolioSurface
 * (`apps/web/CONTEXT.md`): it has no active project, so it deliberately lives
 * under the workspace root, never under `/projects/<projId>/`.
 *
 * The same `listProjectRows` service call the legacy `/projects` route runs is
 * preserved verbatim here — migration-strategy.md value-preservation item 1
 * ("every data load / tRPC call from the old route still runs").
 */
export const load: PageServerLoad = ({ params, locals }) => {
	const activeProjectId = locals?.activeProjectId ?? null;
	return {
		ws: params.ws,
		activeProjectId,
		streamed: {
			data: (async () => {
				const { em, ctx } = await requestServiceScope(locals, activeProjectId);
				const projects = await listProjectRows(em, ctx);
				return { projects };
			})(),
		},
	};
};
