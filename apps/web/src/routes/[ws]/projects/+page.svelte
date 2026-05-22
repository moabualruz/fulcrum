<script lang="ts">
	import type { PageData } from "./$types";

	import { Badge, EmptyState } from "@fulcrum/ui-kit";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { projectHomeRoute } from "$lib/components/app/route-map.ts";
	import { cn } from "@fulcrum/ui-kit";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	type ProjectsPayload = Awaited<PageData["streamed"]["data"]>;
</script>

<svelte:head>
	<title>Projects · {data.ws}</title>
</svelte:head>

<!--
	`/<ws>/projects`: the canonical workspace-scoped project list (IA-MAP §1).
	A PortfolioSurface: no active project, every row links to that project's
	canonical home `/<ws>/projects/<projId>`, which lands on the Capture stage.
-->
<section data-route="ws-projects" data-shell-scope="portfolio" class="grid gap-4">
	<header class="grid gap-1">
		<h1 class="text-lg font-semibold text-fg">Projects</h1>
		<p class="text-sm text-fg-subtle">
			Workspace <span class="font-mono text-fg">{data.ws}</span>: pick a project to enter its workflow stages.
		</p>
	</header>

	{#await data.streamed.data}
		<RouteSkeleton rows={4} />
	{:then payload}
		{@const projects = (payload as ProjectsPayload).projects}
		{#if projects.length === 0}
			<EmptyState
				title="No projects yet"
				description="Create a project to start capturing work."
				tone="absence"
			/>
		{:else}
			<ul data-slot="ws-project-list" class="grid gap-2">
				{#each projects as project (project.id)}
					<li>
						<a
							data-slot="ws-project-row"
							data-project-id={project.id}
							href={projectHomeRoute(data.ws, project.slug)}
							class={cn(
								"flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-4 py-3",
								"hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							<span class="grid gap-0.5">
								<span class="text-sm font-medium text-fg">{project.name}</span>
								<span class="font-mono text-xs text-fg-subtle">{project.slug}</span>
							</span>
							<span class="flex items-center gap-2">
								<Badge>{project.open_task_count} open</Badge>
								<Badge>{project.doc_count} docs</Badge>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{:catch}
		<EmptyState
			title="Could not load projects"
			description="Reload the page to try again."
			tone="absence"
		/>
	{/await}
</section>
