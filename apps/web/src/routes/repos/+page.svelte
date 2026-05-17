<script lang="ts">
	import type { ActionData, PageData } from "./$types";
	import { enhance } from "$app/forms";
	import { buttonVariants } from "$lib/components/ui/button";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	function formatStamp(value: string | null): string {
		if (!value) return "never";
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
		class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}
	>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Repos</h1>
		<button
			type="button"
			data-add-repo-trigger
			class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
		>Add repo</button>
	</header>

	<form data-add-repo-form method="POST" class={cn("hidden")}>
		<input type="radio" name="kind" value="local" />
		<input type="radio" name="kind" value="remote" />
		<input name="path" />
		<input name="url" />
		<input name="name" />
		<input name="projectId" value={data.activeProjectId ?? ""} />
	</form>

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
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>State</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Last sync</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Recent commit</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Tasks</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Health</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Actions</th>
					</tr>
				</thead>
				<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
					{#each payload.repos as repo (repo.id)}
						<tr
							data-slot="table-row"
							data-repo-row
							data-repo-id={repo.id}
							class={cn("border-b transition-colors hover:bg-muted/50")}
						>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
								<a href="/repos/{repo.id}" class={cn("hover:underline")}>{repo.slug}</a>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{repo.path}</td>
							<td data-current-branch data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{repo.branch ?? "-"}</td>
							<td data-dirty-state data-slot="table-cell" class={cn("p-2 align-middle")}>{repo.dirty ? "dirty" : "clean"}</td>
							<td data-last-sync data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{formatStamp(repo.lastSyncAt)}</td>
							<td data-recent-commit data-slot="table-cell" class={cn("max-w-64 truncate p-2 align-middle text-muted-foreground")}>{repo.recentCommit ?? "-"}</td>
							<td data-open-task-count data-slot="table-cell" class={cn("p-2 align-middle tabular-nums")}>{repo.openTaskCount}</td>
							<td data-repo-health data-slot="table-cell" class={cn("p-2 align-middle")}>{repo.health}</td>
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
