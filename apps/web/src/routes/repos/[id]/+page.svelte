<script lang="ts">
	import type { PageData } from "./$types";
	import { enhance } from "$app/forms";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "@fulcrum/ui-kit";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatStamp(value: string | null | undefined): string {
		if (!value) return "never";
		return value.slice(0, 16).replace("T", " ");
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="detail" />
{:then payload}
	{@const repo = payload.repo}
	<header
		data-repo-detail-header
		class={cn("mb-6 flex items-center justify-between gap-4 border-b border-border pb-4")}
	>
		<div>
			<h1 class={cn("text-2xl font-semibold tracking-tight")}>{repo.slug}</h1>
			<p class={cn("mt-1 font-mono text-sm text-muted-foreground")}>{repo.path}</p>
			<div class={cn("mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground")}>
				<span data-current-branch>{repo.branch ?? "-"}</span>
				<span data-dirty-state>{repo.dirty ? "dirty" : "clean"}</span>
				<span data-repo-health>{repo.health}</span>
				<span data-last-sync>{formatStamp(repo.lastSyncAt)}</span>
			</div>
			{#if repo.lastSyncError}
				<p data-sync-error class={cn("mt-2 text-sm text-destructive")}>{repo.lastSyncError}</p>
			{/if}
		</div>
		<form method="POST" action="?/sync" use:enhance>
			<button
				type="submit"
				data-sync-now
				class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
			>Sync now</button>
		</form>
	</header>

	<div class={cn("grid grid-cols-1 gap-6 lg:grid-cols-2")}>
		<section data-repo-branches class={cn("space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>Branches</h2>
			{#if payload.branches.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No branches found.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.branches as branch (branch.id ?? branch.name)}
						<li data-branch-row class={cn("flex items-center gap-2 font-mono text-xs")}>
							<span>{branch.isCurrent ? "*" : "-"}</span>
							<span>{branch.name}</span>
							<span class={cn("text-muted-foreground")}>{branch.sha ?? ""}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section data-recent-commits class={cn("space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>Recent commits</h2>
			{#if payload.commits.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No commits found.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.commits as commit (commit.id ?? commit.sha)}
						<li data-commit-row class={cn("flex items-start gap-2 text-sm")}>
							<span class={cn("w-20 shrink-0 font-mono text-xs text-muted-foreground")}>{commit.sha.slice(0, 8)}</span>
							<span class={cn("flex-1 truncate")}>{commit.message ?? ""}</span>
							<span class={cn("shrink-0 font-mono text-xs text-muted-foreground")}>{formatStamp(commit.committedAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section data-repo-files class={cn("space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>Files</h2>
			{#if payload.files.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No files found.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.files as file (file.id ?? file.path)}
						<li data-file-row class={cn("flex items-center gap-2 text-sm")}>
							<span class={cn("font-mono text-xs text-muted-foreground")}>{file.kind}</span>
							<span>{file.path}</span>
							<span class={cn("text-muted-foreground")}>{file.size ?? ""}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section data-sync-log class={cn("space-y-2")}>
			<h2 class={cn("text-sm font-semibold uppercase text-muted-foreground")}>Sync log</h2>
			{#if payload.syncLog.length === 0}
				<p class={cn("text-sm text-muted-foreground")}>No sync log entries.</p>
			{:else}
				<ul class={cn("space-y-1")}>
					{#each payload.syncLog as entry (entry.id ?? `${entry.status}-${entry.createdAt}`)}
						<li data-sync-log-row class={cn("flex items-start gap-2 text-sm")}>
							<span class={cn("w-20 shrink-0 text-muted-foreground")}>{entry.status}</span>
							<span class={cn("flex-1")}>{entry.message ?? ""}</span>
							<span class={cn("font-mono text-xs text-muted-foreground")}>{formatStamp(entry.createdAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/await}
