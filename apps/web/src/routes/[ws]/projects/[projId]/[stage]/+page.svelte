<script lang="ts">
	import { onMount } from "svelte";
	import type { PageData } from "./$types";

	import { Badge } from "@fulcrum/ui-kit";
	import { WORKFLOW_STAGES, type WorkflowStage, traceFromHash } from "$lib/components/app/route-map.ts";
	import CaptureStageWorkbench from "$lib/components/app/CaptureStageWorkbench.svelte";
	import { cn } from "$lib/utils.js";

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

	/**
	 * One findable feature view of a stage, mapped to its existing production
	 * route. The stage route model re-homes feature buckets under WorkflowStages
	 * (migration-strategy.md §Web step 2-3); every entry here is a feature that
	 * moved under this stage and stays reachable from its canonical stage home
	 * (value-preservation item 4 — "moved features are findable").
	 */
	interface StageView {
		id: string;
		label: string;
		summary: string;
		/** Existing production route the feature already renders at — no 404. */
		href: string;
	}

	const STAGE_VIEWS: Record<WorkflowStage, readonly StageView[]> = {
		capture: [
			{ id: "inbox", label: "Inbox", summary: "Intake queue", href: "/inbox" },
			{ id: "docs", label: "Docs", summary: "Document tree", href: "/docs" },
		],
		plan: [
			{ id: "sessions", label: "Sessions", summary: "Planning sessions", href: "/planning" },
			{ id: "reviews", label: "Reviews", summary: "Plan + prototype review", href: "/plan-review" },
			{ id: "prototypes", label: "Prototypes", summary: "Prototype gallery", href: "/plan-prototypes" },
			{ id: "prompts", label: "Prompts", summary: "Prompt templates", href: "/plan-prompts" },
		],
		build: [
			{ id: "board", label: "Board", summary: "Task board", href: "/build-board" },
			{ id: "graph", label: "Graph", summary: "Dependency graph", href: "/build-graph" },
			{ id: "runs", label: "Runs", summary: "Agent runs feed", href: "/build-runs" },
			{ id: "timeline", label: "Timeline", summary: "Version timeline", href: "/build-timeline" },
		],
		review: [
			{ id: "queue", label: "Workbench", summary: "Review workbench", href: "/review-search" },
			{ id: "comments", label: "Comments", summary: "Review comments", href: "/comments" },
			{ id: "templates", label: "Templates", summary: "Review templates", href: "/review-templates" },
		],
		ship: [
			{ id: "artifacts", label: "Artifacts", summary: "Release artifacts", href: "/ship-archive" },
		],
		operate: [
			{ id: "doctor", label: "Doctor", summary: "Subsystem health", href: "/doctor" },
			{ id: "alerts", label: "Alerts", summary: "Alerts console", href: "/operate-alerts" },
			{ id: "audit", label: "Audit", summary: "Audit log", href: "/audit" },
			{ id: "mcp", label: "MCP", summary: "MCP server scope", href: "/operate-mcp" },
		],
	};

	const stageLabel = $derived(
		WORKFLOW_STAGES.find((entry) => entry.stage === data.stage)?.label ?? data.stage,
	);
	const views = $derived(STAGE_VIEWS[data.stage]);
</script>

<svelte:head>
	<title>{stageLabel} · {data.projId}</title>
</svelte:head>

{#if data.stage === "capture" && data.captureView}
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
<!--
	`/<ws>/projects/<projId>/<stage>` — the canonical WorkflowStage workbench
	(IA-MAP §1). Mirrors the OD `desktop-shell.html` `.canvas-rep` region: a hero
	row scoped to the active stage, then a dense card grid of the stage's views.
	`data-stage` keeps the chrome (StageRail / ScopeBar) synced to the route.
-->
<section data-route="ws-stage" data-stage={data.stage} class="grid gap-4">
	<header
		data-slot="stage-hero"
		class="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-4 py-3"
	>
		<div class="grid gap-1">
			<h1 class="text-lg font-semibold text-fg">{stageLabel}</h1>
			<p class="text-sm text-fg-subtle">
				Project <span class="font-mono text-fg">{data.projId}</span> ·
				default view <span class="font-mono text-fg">{data.defaultSub}</span>
			</p>
		</div>
		<Badge>{views.length} views</Badge>
	</header>

	<ul data-slot="stage-view-grid" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
		{#each views as view (view.id)}
			<li>
				<a
					data-slot="stage-view-card"
					data-view-id={view.id}
					href={view.href}
					class={cn(
						"grid h-full gap-1 rounded-sm border border-border bg-surface px-4 py-3",
						"hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					<span class="text-sm font-medium text-fg">{view.label}</span>
					<span class="text-xs text-fg-subtle">{view.summary}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
{/if}
