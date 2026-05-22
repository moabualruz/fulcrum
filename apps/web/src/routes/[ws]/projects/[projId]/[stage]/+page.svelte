<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import type { PageData } from "./$types";

	import { EmptyState, LoadingState, TreeView, type TreeNode } from "@fulcrum/ui-kit";
	import { WORKFLOW_STAGE_ENTRIES, type WorkflowStage, traceFromHash } from "$lib/components/app/route-map.ts";
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
	import ReviewDetailPage from "../../../../review/[reviewId]/+page.svelte";
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
	 * The trace id: the server reads a `?trace=` fallback; the canonical
	 * `#trace=<id>` hash never reaches the server, so the client hydrates it
	 * from `location.hash` (IA-MAP §1 "trace survives as URL hash").
	 */
	let clientTraceId = $state<string | null>(null);
	onMount(() => {
		clientTraceId = traceFromHash(typeof location !== "undefined" ? location.hash : null);
	});
	const traceId = $derived(data.traceId ?? clientTraceId);

	const stageLabel = $derived(
		WORKFLOW_STAGE_ENTRIES.find((entry) => entry.stage === data.stage)?.label ?? data.stage,
	);
	const loadingState = $derived(page.url.searchParams.get("state") === "loading");
	const selectedSub = $derived(data.defaultSub);

	type DeferredWorkbench = {
		stage: WorkflowStage;
		sub: string;
		title: string;
		description: string;
		status: string;
	};

	const missionNodes: TreeNode[] = [
		{
			id: "mission-web-fidelity",
			label: "Mission: web design fidelity recovery",
			hint: "active",
			children: [
				{
					id: "wave-16",
					label: "Wave 16: canonical IA closure",
					hint: "in progress",
					children: [
						{
							id: "increment-stage-routes",
							label: "Increment: stage subroute coverage",
							children: [
								{ id: "task-review-detail", label: "Review detail workbench", hint: "Review" },
								{ id: "task-stage-ia-subroutes", label: "Build, Ship, Operate subroutes", hint: "Cross-stage" },
								{ id: "task-operate-audit", label: "Operate audit route", hint: "Operate" },
							],
						},
					],
				},
			],
		},
		{
			id: "mission-agent-os",
			label: "Mission: local-first Agent OS",
			hint: "foundation",
			children: [
				{
					id: "wave-foundation",
					label: "Wave: workflow foundation",
					children: [
						{ id: "task-context-engine", label: "Context engine surfaces" },
						{ id: "task-artifact-ledger", label: "Artifact ledger" },
					],
				},
			],
		},
	];

	let expandedMissionIds = $state(new Set<string>(["mission-web-fidelity", "wave-16", "increment-stage-routes"]));
	let selectedMissionId = $state("task-stage-ia-subroutes");

	const deferredWorkbenches: readonly DeferredWorkbench[] = [
		{
			stage: "build",
			sub: "table",
			title: "Build table",
			description: "Spreadsheet-style task planning is reserved by IA-MAP for dense compare-and-edit work.",
			status: "Scoped placeholder until the table OD workbench lands.",
		},
		{
			stage: "build",
			sub: "calendar",
			title: "Build calendar",
			description: "Calendar planning is reserved for due-date and sprint-date review across active build work.",
			status: "Scoped placeholder until the calendar OD workbench lands.",
		},
		{
			stage: "build",
			sub: "cycles",
			title: "Build cycles",
			description: "Cycle list and cycle detail routes stay under Build so cycle planning does not drift into portfolio scope.",
			status: "Scoped placeholder until cycle workbenches land.",
		},
		{
			stage: "build",
			sub: "modules",
			title: "Build modules",
			description: "Module planning belongs to Build as the implementation-unit view of active work.",
			status: "Scoped placeholder until module workbenches land.",
		},
		{
			stage: "review",
			sub: "qa",
			title: "Review QA",
			description: "Generated QA reports are review gates, separate from the review queue and PR workbench.",
			status: "Scoped placeholder until the QA report workbench lands.",
		},
		{
			stage: "review",
			sub: "uat",
			title: "Review UAT",
			description: "UAT handoff is an approval gate under Review, not a queue filter.",
			status: "Scoped placeholder until the UAT handoff workbench lands.",
		},
		{
			stage: "review",
			sub: "e2e",
			title: "Review E2E",
			description: "Generated E2E runner and result review stay in the Review stage.",
			status: "Scoped placeholder until the E2E result workbench lands.",
		},
		{
			stage: "ship",
			sub: "reports",
			title: "Ship reports",
			description: "Cycle reports and generated narratives belong to Ship release evidence.",
			status: "Scoped placeholder until the reports workbench lands.",
		},
		{
			stage: "ship",
			sub: "memory",
			title: "Ship memory",
			description: "Memory promotion reviews candidate artifacts before durable memory entry creation.",
			status: "Scoped placeholder until memory promotion lands.",
		},
		{
			stage: "operate",
			sub: "runs",
			title: "Operate runs",
			description: "Run history is operational observability across cycles and agents.",
			status: "Scoped placeholder until the runs history workbench lands.",
		},
		{
			stage: "operate",
			sub: "inbox",
			title: "Operate inbox",
			description: "Notifications, filters, and mark-read operations live in the Operate stage.",
			status: "Scoped placeholder until the project inbox workbench lands.",
		},
		{
			stage: "operate",
			sub: "audit",
			title: "Operate audit",
			description: "Audit log review is separate from telemetry settings and records project-scoped activity.",
			status: "Scoped placeholder until the audit-log workbench lands.",
		},
		{
			stage: "operate",
			sub: "error-logs",
			title: "Operate error logs",
			description: "Error fingerprint grouping belongs to Operate incident review.",
			status: "Scoped placeholder until the error-log workbench lands.",
		},
		{
			stage: "operate",
			sub: "settings",
			title: "Operate settings",
			description: "Project settings tabs stay under Operate, separate from workspace settings.",
			status: "Scoped placeholder until project settings tabs land.",
		},
	];

	const deferredWorkbench = $derived(
		deferredWorkbenches.find((workbench) => workbench.stage === data.stage && workbench.sub === selectedSub),
	);
	const shipArtifactWorkbench = $derived(
		data.stage === "ship" &&
			selectedSub !== "artifacts" &&
			selectedSub !== "archive" &&
			!deferredWorkbench
			? {
					stage: "ship" as const,
					sub: selectedSub,
					title: "Artifact detail",
					description: "Artifact preview and download stays in Ship for release evidence.",
					status: "Scoped placeholder until artifact detail lands.",
				}
			: null,
	);
</script>

{#snippet renderDeferredWorkbench(workbench: DeferredWorkbench)}
	<section
		data-route="stage-deferred-workbench"
		data-stage={workbench.stage}
		data-sub={workbench.sub}
		class="min-h-full overflow-auto bg-background p-6 text-foreground"
		aria-labelledby={`stage-${workbench.stage}-${workbench.sub}-heading`}
	>
		<div class="mx-auto flex max-w-6xl flex-col gap-5">
			<header class="flex flex-col gap-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{stageLabel} / {workbench.sub}
				</p>
				<h1 id={`stage-${workbench.stage}-${workbench.sub}-heading`} class="text-2xl font-semibold">
					{workbench.title}
				</h1>
				<p class="max-w-3xl text-sm text-muted-foreground">
					{workbench.description}
				</p>
			</header>
			<EmptyState
				title="Workbench pending"
				description={workbench.status}
				tone="steady"
				data-stage-workbench-state="deferred"
			/>
		</div>
	</section>
{/snippet}

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
		`/<ws>/projects/<projId>/capture`: the Capture WorkflowStage workbench
		(`prd-web-capture-stage-shell`; OD `capture.html`, `capture-drafts.html`,
		`capture-promoted.html`). The Capture stage renders its own OD-fidelity
		docs/drafts/promoted/inbox workbench, not the generic stage card grid.
		The mobile shell also exposes the `Block actions` group above bottom tabs.
	-->
	<CaptureStageWorkbench
		ws={data.ws}
		projId={data.projId}
		view={data.captureView}
		steps={data.captureSteps}
		{traceId}
	/>
{:else}
	{#if data.stage === "plan" && selectedSub === "missions"}
		<section
			data-route="plan-missions"
			class="min-h-full overflow-auto bg-background p-6 text-foreground"
			aria-labelledby="plan-missions-heading"
		>
			<div class="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
				<header class="lg:col-span-2">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Plan / Missions
					</p>
					<h1 id="plan-missions-heading" class="mt-2 text-2xl font-semibold">
						Mission tree
					</h1>
					<p class="mt-2 max-w-3xl text-sm text-muted-foreground">
						Mission - Wave - Increment - Task hierarchy for active recovery and foundation work.
					</p>
				</header>
				<div
					data-mission-tree-panel
					class="rounded-md border border-border bg-card p-3"
				>
					<TreeView
						nodes={missionNodes}
						bind:expandedIds={expandedMissionIds}
						bind:selectedId={selectedMissionId}
						aria-label="Mission hierarchy"
					/>
				</div>
				<aside
					data-mission-detail
					class="rounded-md border border-border bg-card p-4"
					aria-label="Selected mission detail"
				>
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Selected task
					</p>
					<h2 class="mt-2 text-base font-semibold">Canonical stage IA</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						Review detail, Build/Ship/Operate subroutes, and Operate audit links are tracked as one route-model increment.
					</p>
					<p class="mt-4 text-xs text-muted-foreground">Current node: {selectedMissionId}</p>
				</aside>
			</div>
		</section>
	{:else if data.stage === "plan" && selectedSub === "review"}
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
	{:else if data.stage === "build" && deferredWorkbench}
		{@render renderDeferredWorkbench(deferredWorkbench)}
	{:else if data.stage === "build"}
		<BuildBoardPage />
	{:else if data.stage === "review" && selectedSub === "search"}
		<ReviewSearchPage />
	{:else if data.stage === "review" && selectedSub === "templates"}
		<ReviewTemplatesPage />
	{:else if data.stage === "review" && selectedSub === "comments"}
		<CommentsPage />
	{:else if data.stage === "review" && selectedSub === "queue"}
		<ReviewPage />
	{:else if data.stage === "review" && deferredWorkbench}
		{@render renderDeferredWorkbench(deferredWorkbench)}
	{:else if data.stage === "review"}
		<ReviewDetailPage />
	{:else if data.stage === "ship" && selectedSub === "archive"}
		<ShipArchivePage />
	{:else if data.stage === "ship" && deferredWorkbench}
		{@render renderDeferredWorkbench(deferredWorkbench)}
	{:else if data.stage === "ship" && shipArtifactWorkbench}
		{@render renderDeferredWorkbench(shipArtifactWorkbench)}
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
	{:else if data.stage === "operate" && deferredWorkbench}
		{@render renderDeferredWorkbench(deferredWorkbench)}
	{:else if data.stage === "operate"}
		<DoctorPage data={data.doctorData} />
	{/if}
{/if}
