<script lang="ts">
	import type { PageData } from "./$types";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatStamp(value: string): string {
		return value.slice(0, 16).replace("T", " ");
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="detail" />
{:then payload}
	{@const repo = payload.repo}
	<header
		data-repo-detail-header
		class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-6")}
	>
		<div>
			<h1 class={cn("text-2xl font-semibold tracking-tight")}>{repo.slug}</h1>
			<p class={cn("text-sm text-muted-foreground font-mono mt-1")}>{repo.root_path}</p>
		</div>
		<nav class={cn("flex gap-2 text-sm")}>
			<a href="/repos/{repo.id}/files" class={cn("hover:underline text-muted-foreground")}>Files</a>
			<a href="/repos/{repo.id}/commits" class={cn("hover:underline text-muted-foreground")}>Commits</a>
		</nav>
	</header>

	<div class={cn("grid grid-cols-1 gap-6 lg:grid-cols-3")}>
		<!-- Branches -->
		<section data-repo-branches class={cn("space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase tracking-wide text-muted-foreground")}>Branches</h2>
			{#if payload.branches.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No branches found.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.branches as branch (branch.name)}
						<li
							data-branch-row
							data-branch-name={branch.name}
							class={cn("flex items-center gap-2 font-mono text-xs")}
						>
							{#if branch.isCurrent}
								<span class={cn("text-green-600 dark:text-green-400")}>●</span>
							{:else}
								<span class={cn("text-muted-foreground")}>○</span>
							{/if}
							<span class={branch.isCurrent ? cn("font-semibold") : ""}>{branch.name}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Recent commits -->
		<section data-repo-commits class={cn("lg:col-span-2 space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase tracking-wide text-muted-foreground")}>Recent commits</h2>
			{#if payload.commits.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No commits found.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.commits as commit (commit.sha)}
						<li
							data-commit-row
							data-sha={commit.sha}
							class={cn("flex items-start gap-2 text-sm")}
						>
							<span class={cn("font-mono text-xs text-muted-foreground w-20 shrink-0 pt-0.5")}>{commit.shortSha}</span>
							<span class={cn("flex-1 truncate")}>{commit.message}</span>
							<span class={cn("font-mono text-xs text-muted-foreground shrink-0")}>{formatStamp(commit.date)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Linked tasks -->
		<section data-repo-linked-tasks class={cn("lg:col-span-3 space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase tracking-wide text-muted-foreground")}>Linked tasks</h2>
			{#if payload.linkedTasks.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No linked tasks.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.linkedTasks as task (task.id)}
						<li
							data-linked-task
							data-task-id={task.id}
							class={cn("flex items-center gap-2 text-sm")}
						>
							<span class={cn("text-muted-foreground text-xs w-24 shrink-0")}>{task.status}</span>
							<span>{task.title}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/await}
