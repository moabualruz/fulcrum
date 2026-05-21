import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { projectListRoute, withTrace } from "$lib/components/app/route-map.ts";

/**
 * `/<ws>`: workspace home (IA-MAP §1). The workspace root has no canonical
 * surface of its own; it resolves to the project list, the workspace-scoped
 * portfolio surface. The `#trace=<id>` hash and any filter query survive the
 * redirect (IA-MAP §1 URL invariants).
 */
export const load: PageServerLoad = ({ params, url }) => {
	throw redirect(308, withTrace(projectListRoute(params.ws), url));
};
