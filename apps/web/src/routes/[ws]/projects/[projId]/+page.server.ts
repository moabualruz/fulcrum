import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { stageRoute, withTrace } from "$lib/components/app/route-map.ts";

/**
 * `/<ws>/projects/<projId>`: project home (IA-MAP §1: "project home, Capture
 * default"). The project root resolves to the Capture stage workbench, the
 * first WorkflowStage. The `#trace=<id>` hash and any filter query survive the
 * redirect so a trace deep link to the project root keeps its trace.
 */
export const load: PageServerLoad = ({ params, url }) => {
	throw redirect(308, withTrace(stageRoute(params.ws, params.projId, "capture"), url));
};
