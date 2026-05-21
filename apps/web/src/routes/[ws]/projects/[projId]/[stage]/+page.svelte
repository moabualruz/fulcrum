<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import type { PageData } from "./$types";

	import { LoadingState } from "@fulcrum/ui-kit";
	import { WORKFLOW_STAGES, type WorkflowStage, traceFromHash } from "$lib/components/app/route-map.ts";
	import CaptureStageWorkbench from "$lib/components/app/CaptureStageWorkbench.svelte";
	import PlanSessionPage from "../../../../plan-session/+page.svelte";
	import PlanReviewPage from "../../../../plan-review/+page.svelte";
	import PlanPromptsPage from "../../../../plan-prompts/+page.svelte";
	import PlanPrototypesPage from "../../../../plan-prototypes/+page.svelte";
	import PlanTemplatesPage from "../../../../plan-templates/+page.svelte";
	import BuildBoardPage from "../../../../build-board/+page.svelte";
	import BuildListPage from "../../../../build-list/+page.svelte";
	import BuildTimelinePage from "../../../../build-timeline/+page.svelte";
	import BuildGraphPage from "../../../../build-graph/+page.svelte";
	import BuildRunsPage from "../../../../build-runs/+page.svelte";
	import ReviewPage from "../../../../review/+page.svelte";
	import ReviewSearchPage from "../../../../review-search/+page.svelte";
	import ReviewTemplatesPage from "../../../../review-templates/+page.svelte";
	import CommentsPage from "../../../../comments/+page.svelte";
	import ShipPage from "../../../../ship/+page.svelte";
	import ShipArchivePage from "../../../../ship-archive/+page.svelte";
	import DoctorPage from "../../../../doctor/+page.svelte";
	import OperateAlertsPage from "../../../../operate-alerts/+page.svelte";
	import OperateMcpPage from "../../../../operate-mcp/+page.svelte";
	import OperatePluginsPage from "../../../../operate-plugins/+page.svelte";
	import OperateTelemetryPage from "../../../../operate-telemetry/+page.svelte";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	/**
	 * The trace id — the server reads a `?trace=` fallback; the canonical
	 * `#trace=<id>` hash never reaches the server, so the client hydrates it
	 * from `location.hash` (IA-MAP §1 "trace survives as URL hash").
	 */
	let clientTraceId = $state<string | null>(null);
	onMount(() => {
		clientTraceId = traceFromHash(typeof location !== "undefined" ? location.hash : null);
	});
	const traceId = $derived(data.traceId ?? clientTraceId);

	const stageLabel = $derived(
		WORKFLOW_STAGES.find((entry) => entry.stage === data.stage)?.label ?? data.stage,
	);
	const loadingState = $derived(page.url.searchParams.get("state") === "loading");
	const selectedSub = $derived(data.defaultSub);
</script>

<svelte:head>
	<title>{stageLabel} · {data.projId}</title>
</svelte:head>

{#if loadingState}
	<section data-route="ws-stage" data-stage={data.stage} data-state="loading" class="grid gap-4">
		<LoadingState
			title={`Loading ${stageLabel}`}
			description="Fetching project scope, stage chrome, and workbench rows."
			shape="feed"
			rows={4}
		/>
	</section>
{:else if data.stage === "capture" && data.captureView}
	<!--
		`/<ws>/projects/<projId>/capture` — the Capture WorkflowStage workbench
		(`prd-web-capture-stage-shell`; OD `capture.html`, `capture-drafts.html`,
		`capture-promoted.html`). The Capture stage renders its own OD-fidelity
		docs/drafts/promoted/inbox workbench, not the generic stage card grid.
	-->
	<CaptureStageWorkbench
		ws={data.ws}
		projId={data.projId}
		view={data.captureView}
		steps={data.captureSteps}
		{traceId}
	/>
{:else}
	{#if data.stage === "plan" && selectedSub === "review"}
		<PlanReviewPage />
	{:else if data.stage === "plan" && selectedSub === "prompts"}
		<PlanPromptsPage />
	{:else if data.stage === "plan" && selectedSub === "prototypes"}
		<PlanPrototypesPage />
	{:else if data.stage === "plan" && selectedSub === "templates"}
		<PlanTemplatesPage />
	{:else if data.stage === "plan"}
		<PlanSessionPage />
	{:else if data.stage === "build" && selectedSub === "list"}
		<BuildListPage />
	{:else if data.stage === "build" && (selectedSub === "gantt" || selectedSub === "timeline")}
		<BuildTimelinePage data={data.buildTimelineData} />
	{:else if data.stage === "build" && selectedSub === "graph"}
		<BuildGraphPage />
	{:else if data.stage === "build" && selectedSub === "runs"}
		<BuildRunsPage />
	{:else if data.stage === "build"}
		<BuildBoardPage />
	{:else if data.stage === "review" && selectedSub === "search"}
		<ReviewSearchPage />
	{:else if data.stage === "review" && selectedSub === "templates"}
		<ReviewTemplatesPage />
	{:else if data.stage === "review" && selectedSub === "comments"}
		<CommentsPage />
	{:else if data.stage === "review"}
		<ReviewPage />
	{:else if data.stage === "ship" && selectedSub === "archive"}
		<ShipArchivePage />
	{:else if data.stage === "ship"}
		<ShipPage />
	{:else if data.stage === "operate" && selectedSub === "alerts"}
		<OperateAlertsPage />
	{:else if data.stage === "operate" && selectedSub === "mcp"}
		<OperateMcpPage />
	{:else if data.stage === "operate" && selectedSub === "plugins"}
		<OperatePluginsPage />
	{:else if data.stage === "operate" && selectedSub === "telemetry"}
		<OperateTelemetryPage />
	{:else if data.stage === "operate"}
		<DoctorPage data={data.doctorData} />
	{/if}
{/if}
