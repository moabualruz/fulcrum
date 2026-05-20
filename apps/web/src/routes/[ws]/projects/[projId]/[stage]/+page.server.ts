import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { isWorkflowStage, STAGE_DEFAULT_SUB, type WorkflowStage } from "$lib/components/app/route-map.ts";

/**
 * `/<ws>/projects/<projId>/<stage>` — the canonical WorkflowStage workbench
 * route (IA-MAP §1). `<stage>` must be one of the six canonical WorkflowStages;
 * any other value is genuinely not a route and 404s — that is correct, an
 * unknown stage segment has no canonical home.
 *
 * The route resolves the active stage and its default sub-view; the rendered
 * workbench is a stage landing that links every existing feature view of the
 * stage to its canonical home, so a feature that moved under the stage model
 * stays findable (migration-strategy.md value-preservation item 4).
 */
export const load: PageServerLoad = ({ params }) => {
	const stage = params.stage;
	if (!isWorkflowStage(stage)) {
		throw error(404, `Unknown workflow stage "${stage}"`);
	}
	const typed: WorkflowStage = stage;
	return {
		ws: params.ws,
		projId: params.projId,
		stage: typed,
		defaultSub: STAGE_DEFAULT_SUB[typed],
	};
};
