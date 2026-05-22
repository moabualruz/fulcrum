import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import {
	isKnownStageSubroute,
	isReviewDetailSubroute,
	isShipArtifactSubroute,
	isWorkflowStage,
	STAGE_DEFAULT_SUB,
	type WorkflowStage,
	traceFromHash,
} from "$lib/components/app/route-map.ts";
import {
	isCaptureView,
	type CaptureStep,
	type CaptureView,
} from "$lib/components/app/capture-stage.ts";
import {
	_degradedFixtureChecks,
	_deriveSummary,
	_doctorTelemetryTiles,
	type DoctorWorkbench,
} from "../../../../../doctor/+page.server.ts";
import { buildTimelineFixtureData } from "$lib/components/app/build-timeline-fixture.ts";

export const load: PageServerLoad = async (event) => {
	const stage = event.params.stage;
	if (!isWorkflowStage(stage)) {
		throw error(404, `Unknown workflow stage "${stage}"`);
	}

	const typed: WorkflowStage = stage;
	const sub = event.params.sub;
	const known =
		isKnownStageSubroute(typed, sub) ||
		(typed === "review" && isReviewDetailSubroute(sub)) ||
		(typed === "ship" && isShipArtifactSubroute(sub));
	if (!known) {
		throw error(404, `Unknown ${typed} stage route "${sub}"`);
	}

	const traceId =
		event.url.searchParams.get("trace") ?? traceFromHash(event.url.searchParams.get("trace"));
	const doctorChecks = _degradedFixtureChecks();
	const captureView: CaptureView | null = typed === "capture" && isCaptureView(sub) ? sub : null;
	const captureSteps: CaptureStep[] = [];

	return {
		ws: event.params.ws,
		projId: event.params.projId,
		stage: typed,
		sub,
		defaultSub: STAGE_DEFAULT_SUB[typed],
		captureView,
		captureSteps,
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
