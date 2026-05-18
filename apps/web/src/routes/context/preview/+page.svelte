<script lang="ts">
	import type { PageData } from "./$types";

	import { buttonVariants } from "@fulcrum/ui-kit";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function pct(used: number, total: number): number {
		return Math.round((used / total) * 100);
	}

	function barColor(used: number, total: number): string {
		const p = pct(used, total);
		if (p > 90) return "bg-red-500";
		if (p > 70) return "bg-amber-500";
		return "bg-green-500";
	}
</script>

<header
	data-context-header
	class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-6")}
>
	<h1 class={cn("text-2xl font-semibold tracking-tight")}>Context preview</h1>
</header>

{#await data.streamed.options}
	<RouteSkeleton kind="list" />
{:then opts}
	<form
		data-context-selectors
		method="GET"
		class={cn("mb-6 flex flex-wrap items-center gap-3")}
	>
		<div>
			<label for="ctx-project" class={cn("text-xs text-muted-foreground block")}>Project</label>
			<select
				id="ctx-project"
				name="projectId"
				data-project-select
				class={cn("border-input bg-background flex h-9 w-48 rounded-md border px-3 py-1 text-sm shadow-xs")}
			>
				<option value="">— select —</option>
				{#each opts.projects as p (p.id)}
					<option value={p.id} selected={data.selectedProjectId === p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="ctx-task" class={cn("text-xs text-muted-foreground block")}>Task</label>
			<select
				id="ctx-task"
				name="taskId"
				data-task-select
				class={cn("border-input bg-background flex h-9 w-64 rounded-md border px-3 py-1 text-sm shadow-xs")}
			>
				<option value="">— select —</option>
				{#each opts.tasks as t (t.id)}
					<option value={t.id} selected={data.selectedTaskId === t.id}>{t.title} ({t.status})</option>
				{/each}
			</select>
		</div>
		<div class={cn("self-end")}>
			<button
				type="submit"
				class={cn(buttonVariants({ variant: "default" }))}
			>Preview</button>
		</div>
	</form>

	{#if data.streamed.bundle}
		{#await data.streamed.bundle}
			<RouteSkeleton kind="list" />
		{:then bundle}
			<!-- Token budget bar -->
			<div data-token-budget class={cn("mb-6")}>
				<div class={cn("flex items-center justify-between text-xs text-muted-foreground mb-1")}>
					<span>Token budget</span>
					<span>{bundle.tokenBudget.used} / {bundle.tokenBudget.total} ({pct(bundle.tokenBudget.used, bundle.tokenBudget.total)}%)</span>
				</div>
				<div class={cn("h-2 w-full rounded-full bg-muted overflow-hidden")}>
					<div
						data-budget-bar
						class={cn("h-full rounded-full transition-all", barColor(bundle.tokenBudget.used, bundle.tokenBudget.total))}
						style="width: {pct(bundle.tokenBudget.used, bundle.tokenBudget.total)}%"
					></div>
				</div>
			</div>

			<!-- 4-pane grid -->
			<div data-context-panes class={cn("grid gap-4 md:grid-cols-2")}>
				<!-- Pane 1: Memories -->
				<div data-pane-memories class={cn("rounded-lg border border-border p-4")}>
					<h2 class={cn("text-sm font-semibold mb-2")}>Memories ({bundle.memories.length})</h2>
					{#if bundle.memories.length === 0}
						<p class={cn("text-xs text-muted-foreground")}>No memories</p>
					{:else}
						<ul class={cn("space-y-1 text-sm")}>
							{#each bundle.memories as mem (mem.id)}
								<li>
									<span class={cn("font-medium")}>{mem.key}</span>
									<span class={cn("text-muted-foreground")}> — {mem.body.slice(0, 80)}{mem.body.length > 80 ? "..." : ""}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Pane 2: Documents -->
				<div data-pane-documents class={cn("rounded-lg border border-border p-4")}>
					<h2 class={cn("text-sm font-semibold mb-2")}>Linked docs ({bundle.documents.length})</h2>
					{#if bundle.documents.length === 0}
						<p class={cn("text-xs text-muted-foreground")}>No linked documents</p>
					{:else}
						<ul class={cn("space-y-1 text-sm")}>
							{#each bundle.documents as doc (doc.id)}
								<li>
									<a href="/docs/{doc.id}" class={cn("font-medium hover:underline")}>{doc.title}</a>
									<span class={cn("text-muted-foreground")}> — {doc.body_excerpt.slice(0, 80)}{doc.body_excerpt.length > 80 ? "..." : ""}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Pane 3: Recent runs -->
				<div data-pane-runs class={cn("rounded-lg border border-border p-4")}>
					<h2 class={cn("text-sm font-semibold mb-2")}>Recent runs ({bundle.recentRuns.length})</h2>
					{#if bundle.recentRuns.length === 0}
						<p class={cn("text-xs text-muted-foreground")}>No recent runs</p>
					{:else}
						<ul class={cn("space-y-1 text-sm")}>
							{#each bundle.recentRuns as run (run.id)}
								<li>
									<a href="/runs/{run.id}" class={cn("font-medium hover:underline")}>{run.agent}</a>
									<span class={cn("rounded bg-muted px-1.5 py-0.5 text-xs ml-1")}>{run.status}</span>
									<span class={cn("text-xs text-muted-foreground ml-1")}>{run.started_at.slice(0, 10)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Pane 4: Artifacts -->
				<div data-pane-artifacts class={cn("rounded-lg border border-border p-4")}>
					<h2 class={cn("text-sm font-semibold mb-2")}>Artifacts ({bundle.artifacts.length})</h2>
					{#if bundle.artifacts.length === 0}
						<p class={cn("text-xs text-muted-foreground")}>No artifacts</p>
					{:else}
						<ul class={cn("space-y-1 text-sm")}>
							{#each bundle.artifacts as art (art.id)}
								<li>
									<span class={cn("rounded bg-muted px-1.5 py-0.5 text-xs")}>{art.kind}</span>
									<span class={cn("ml-1")}>{art.title}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		{:catch err}
			<p class={cn("text-destructive text-sm")}>Failed to assemble context: {err.message}</p>
		{/await}
	{:else}
		<div
			data-context-empty
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>Select a project and task, then click Preview to see the context bundle.</div>
	{/if}
{/await}
