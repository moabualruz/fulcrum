import { redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";

import { canonicalRouteForLegacyPath, withTrace } from "$lib/components/app/route-map.ts";

export function redirectLegacyStageRoute(event: RequestEvent): never {
	const target = canonicalRouteForLegacyPath(event.url.pathname);
	throw redirect(308, withTrace(target ?? "/mkh/projects/fulcrum/capture", event.url));
}
