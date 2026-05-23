import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import {
	STAGE_DEFAULT_SUB,
	isWorkflowStage,
	traceFromHash,
	type WorkflowStage,
} from "$lib/components/app/route-map.ts";
import {
	_degradedFixtureChecks,
	_deriveSummary,
	_doctorTelemetryTiles,
	type DoctorWorkbench,
} from "../../../../../../doctor/+page.server.ts";
import { buildTimelineFixtureData } from "$lib/components/app/build-timeline-fixture.ts";

export const load: PageServerLoad = async (event) => {
	const stage = event.params.stage;
	if (!isWorkflowStage(stage)) {
		throw error(404, `Unknown workflow stage "${stage}"`);
	}

	const typed: WorkflowStage = stage;
	if (typed !== "build" || event.params.sub !== "runs") {
		throw error(404, `Unknown ${typed} stage detail route "${event.params.sub}/${event.params.runId}"`);
	}

	const doctorChecks = _degradedFixtureChecks();
	const traceId =
		event.url.searchParams.get("trace") ?? traceFromHash(event.url.searchParams.get("trace"));

	return {
		ws: event.params.ws,
		projId: event.params.projId,
		stage: typed,
		sub: "runs",
		runId: event.params.runId,
		defaultSub: STAGE_DEFAULT_SUB[typed],
		captureView: null,
		captureSteps: [],
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
