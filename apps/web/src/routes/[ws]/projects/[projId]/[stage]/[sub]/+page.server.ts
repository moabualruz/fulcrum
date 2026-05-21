import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import {
	isWorkflowStage,
	STAGE_DEFAULT_SUB,
	traceFromHash,
	type WorkflowStage,
} from "$lib/components/app/route-map.ts";
import {
	_degradedFixtureChecks,
	_deriveSummary,
	_doctorTelemetryTiles,
	type DoctorWorkbench,
} from "../../../../../doctor/+page.server.ts";
import { buildTimelineFixtureData } from "$lib/components/app/build-timeline-fixture.ts";

const KNOWN_SUBROUTES: Readonly<Record<WorkflowStage, readonly string[]>> = {
	capture: ["inbox", "docs", "drafts", "promoted"],
	plan: ["missions", "sessions", "review", "prompts", "prototypes", "templates"],
	build: ["board", "list", "gantt", "timeline", "graph", "runs"],
	review: ["queue", "search", "templates"],
	ship: ["archive", "artifacts"],
	operate: ["doctor", "alerts", "mcp", "plugins", "telemetry"],
};

export const load: PageServerLoad = async (event) => {
	const stage = event.params.stage;
	if (!isWorkflowStage(stage)) {
		throw error(404, `Unknown workflow stage "${stage}"`);
	}

	const typed: WorkflowStage = stage;
	const sub = event.params.sub;
	const known = KNOWN_SUBROUTES[typed].includes(sub);
	if (!known && typed !== "review") {
		throw error(404, `Unknown ${typed} stage route "${sub}"`);
	}

	const traceId =
		event.url.searchParams.get("trace") ?? traceFromHash(event.url.searchParams.get("trace"));
	const doctorChecks = _degradedFixtureChecks();

	return {
		ws: event.params.ws,
		projId: event.params.projId,
		stage: typed,
		sub,
		defaultSub: STAGE_DEFAULT_SUB[typed],
		traceId,
		buildTimelineData: buildTimelineFixtureData(event.url.searchParams.get("state") === "empty"),
		doctorData: {
			streamed: {
				workbench: Promise.resolve({
					checks: doctorChecks,
					summary: _deriveSummary(doctorChecks),
					telemetry: _doctorTelemetryTiles(),
				} satisfies DoctorWorkbench),
			},
		},
	};
};
