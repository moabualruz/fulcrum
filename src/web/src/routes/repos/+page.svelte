<script lang="ts">
	import type { PageData, ActionData } from "./$types";
	import { enhance } from "$app/forms";
	import { buttonVariants } from "$lib/components/ui/button";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const STALE_MS = 24 * 60 * 60 * 1000; // 24 h

	function isStale(last_seen_at: string): boolean {
		return Date.now() - new Date(last_seen_at).getTime() > STALE_MS;
	}

	function formatStamp(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="list" />
{:then payload}
	<header
		data-repos-header
		class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
	>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Repos</h1>
	</header>

	{#if payload.repos.length === 0}
		<div
			data-empty-repos
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>No repos registered yet.</div>
	{:else}
		<div data-slot="table-container" class={cn("relative w-full overflow-x-auto")}>
			<table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
				<thead data-slot="table-header" class={cn("[&_tr]:border-b")}>
					<tr data-slot="table-row" class={cn("border-b transition-colors")}>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Slug</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Path</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Branch</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Last seen</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Actions</th>
					</tr>
				</thead>
				<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
					{#each payload.repos as repo (repo.id)}
						{@const stale = isStale(repo.last_seen_at)}
						<tr
							data-slot="table-row"
							data-repo-row
							data-repo-id={repo.id}
							class={cn("hover:bg-muted/50 border-b transition-colors")}
						>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
								<a href="/repos/{repo.id}" class={cn("hover:underline")}>{repo.slug}</a>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{repo.root_path}</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{repo.default_branch ?? "—"}</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>
								{formatStamp(repo.last_seen_at)}
								{#if stale}
									<span
										data-stale-badge
										class={cn("ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400")}
									>stale</span>
								{/if}
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle")}>
								<form method="POST" action="?/sync" use:enhance>
									<input type="hidden" name="repo_id" value={repo.id} />
									<button
										type="submit"
										data-sync-btn
										data-repo-id={repo.id}
										class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
									>Sync</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/await}
