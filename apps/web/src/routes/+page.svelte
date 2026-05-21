<script lang="ts">
	import { Badge, Stat } from "@fulcrum/ui-kit";
	import ProjectTiles from "$lib/components/dashboard/ProjectTiles.svelte";
	import RecentRuns from "$lib/components/dashboard/RecentRuns.svelte";
	import RecentDocs from "$lib/components/dashboard/RecentDocs.svelte";
	import TopTasks from "$lib/components/dashboard/TopTasks.svelte";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";
	import type { PageData } from "./$types";

	const { data }: { data: PageData } = $props();
	type DashboardPayload = Awaited<PageData["streamed"]["dashboard"]>;
</script>

<svelte:head>
	<title>Portfolio · Fulcrum</title>
</svelte:head>

<!--
	Root `/` with no active project: the portfolio Dashboard PortfolioSurface
	(`prd-web-root-default-screen`, IA-MAP §3, `apps/web/CONTEXT.md`
	PortfolioSurface). With an active project the server `load` redirects to
	that project's Capture stage workbench instead; this surface only renders
	for the no-project case.

	This replaces the retired metric-dashboard root (`00-executive-review.md`
	failure 5): there is no `<h1>Dashboard</h1>` over four zero-metric cards.
	The OD `desktop-shell.html` `.canvas-rep` shape is a hero row + a dense
	card grid: a portfolio landing, not a metric report. The run counts, sync
	(inbox) status, project tiles, and recent runs/docs/tasks the old root
	carried are re-homed here as a workspace overview, not deleted
	(`migration-strategy.md` value-preservation item 4).
-->
<section data-route="portfolio-dashboard" data-shell-scope="portfolio" class="grid gap-6">
	<header data-slot="portfolio-hero" class="grid gap-1">
		<h1 class="text-lg font-semibold text-fg">Portfolio</h1>
		<p class="text-sm text-fg-subtle">
			No project is in scope: pick a project to enter its workflow stages, or review the
			workspace below.
		</p>
	</header>

	{#await data.streamed.dashboard}
		<RouteSkeleton rows={4} />
	{:then dashboard}
		{@const payload = dashboard as DashboardPayload}
		<!--
			Workspace overview: the run counts re-homed from the retired metric
			dashboard, now a Scope summary rather than the page's identity.
			Composed from the `@fulcrum/ui-kit` `Stat` primitive (AGENTS.md
			ui-kit rule), not hand-rolled MetricCards.
		-->
		<div data-slot="portfolio-overview" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<Stat
				data-stat-id="projects"
				label="Projects"
				value={String(payload.counters.projects)}
				hint="across the workspace"
			/>
			<Stat
				data-stat-id="open-tasks"
				label="Open tasks"
				value={String(payload.counters.openTasks)}
				hint="not completed or cancelled"
			/>
			<Stat
				data-stat-id="docs"
				label="Docs"
				value={String(payload.counters.docs)}
				hint="captured documents"
			/>
			<Stat
				data-stat-id="runs-7d"
				label="Runs (7d)"
				value={String(payload.counters.runsLast7d)}
				hint="agent runs, last 7 days"
			/>
		</div>

		<div data-slot="portfolio-projects" class="grid gap-2">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-sm font-semibold text-fg">Projects</h2>
				<Badge data-slot="portfolio-inbox-count">{payload.unreadCount} unread</Badge>
			</div>
			<ProjectTiles tiles={payload.projectTiles} />
		</div>

		<div data-slot="portfolio-activity" class={cn("grid gap-6 md:grid-cols-3")}>
			<RecentRuns runs={payload.recentRuns} />
			<RecentDocs docs={payload.recentDocs} />
			<TopTasks tasks={payload.topTasks} />
		</div>
	{:catch err}
		<p data-slot="portfolio-error" class="text-sm text-destructive">
			Failed to load the portfolio. Reload the page to try again.
			<span class="sr-only">{err.message}</span>
		</p>
	{/await}
</section>
