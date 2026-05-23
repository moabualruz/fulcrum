<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import { cn } from "@fulcrum/ui-kit";

	interface Props {
		data: PageData;
		form?: {
			ok: boolean;
			mode?: "addRepo" | "linkRepo";
			message?: string;
		};
	}

	let { data, form }: Props = $props();
	let addOpen = $state(false);
	let linkOpen = $state(false);
	let mode = $state<"local" | "remote">("local");
</script>

<div data-testid="project-repos-page" class={cn("min-w-0 overflow-x-hidden px-4 py-4 sm:px-6")}>
<header data-project-repos-header class={cn("mb-4 flex min-w-0 flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between")}>
	<div class={cn("flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3")}>
		<a href="/projects/{data.project.id}" data-back-project class={cn("min-w-0 break-words text-sm text-muted-foreground hover:underline")}>← {data.project.name}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Repos</h1>
	</div>
	<div class={cn("flex min-w-0 flex-col gap-2 sm:flex-row")}>
		<button type="button" data-link-repo-trigger onclick={() => (linkOpen = !linkOpen)} class={cn("rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted")}>Link existing</button>
		<button type="button" data-add-repo-trigger onclick={() => (addOpen = !addOpen)} class={cn("bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium shadow-xs")}>Add repo</button>
	</div>
</header>

<section data-add-repo-modal hidden={!addOpen} class={cn("mb-4 rounded-md border border-border bg-background p-4")}>
	<form data-add-repo-form method="POST" action="?/add" use:enhance class={cn("grid gap-3 sm:grid-cols-2")}>
		<div class={cn("flex gap-2 sm:col-span-2")}>
			<label class={cn("inline-flex items-center gap-2 text-sm")}><input type="radio" name="kind" value="local" bind:group={mode} />Path</label>
			<label class={cn("inline-flex items-center gap-2 text-sm")}><input type="radio" name="kind" value="remote" bind:group={mode} />Remote URL</label>
		</div>
		<label class={cn("grid gap-1 text-sm")}>Path<input name="path" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
		<label class={cn("grid gap-1 text-sm")}>Remote URL<input name="url" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
		<label class={cn("grid gap-1 text-sm")}>Name<input name="name" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
		<div class={cn("sm:col-span-2")}>
			<button type="submit" class={cn("bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-1.5 text-sm font-medium shadow-xs")}>Save</button>
		</div>
	</form>
	{#if form?.mode === "addRepo"}
		<p data-add-repo-feedback class={cn("mt-3 text-sm", form.ok ? "text-muted-foreground" : "text-destructive")}>
			{form.ok ? "Repo saved." : form.message}
		</p>
	{/if}
</section>

<section data-link-repo-modal hidden={!linkOpen} class={cn("mb-4 rounded-md border border-border bg-background p-4")}>
	<form data-link-repo-form method="POST" action="?/link" use:enhance class={cn("flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end")}>
		<label class={cn("grid gap-1 text-sm flex-1")}>Repo ID<input name="repoId" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
		<button type="submit" class={cn("bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-1.5 text-sm font-medium shadow-xs")}>Link</button>
	</form>
	{#if form?.mode === "linkRepo"}
		<p data-link-repo-feedback class={cn("mt-3 text-sm", form.ok ? "text-muted-foreground" : "text-destructive")}>
			{form.ok ? "Repo linked." : form.message}
		</p>
	{/if}
</section>

{#if data.repos.length === 0}
	<div data-empty-repos class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No repos linked to this project.</div>
{:else}
	<div data-repo-cards class={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
		{#each data.repos as repo (repo.id)}
			<div data-repo-card data-repo-id={repo.id} class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
				<div class={cn("mb-2 flex min-w-0 items-center justify-between gap-2")}>
					<a href="/repos/{repo.id}" class={cn("min-w-0 break-words font-medium hover:underline")}>{repo.name}</a>
					<span data-repo-kind class={cn("rounded border border-border px-2 py-0.5 text-xs")}>{repo.kind}</span>
				</div>
				{#if repo.currentBranch}
					<div class={cn("text-xs text-muted-foreground mb-1")}>Branch: <span data-current-branch>{repo.currentBranch}</span></div>
				{/if}
				<div class={cn("flex items-center gap-2 text-xs")}>
					<span data-sync-status data-status={repo.syncStatus} class={cn("rounded border border-border px-2 py-0.5")}>{repo.syncStatus}</span>
					<a href="/tasks?project={data.project.id}&repo={repo.id}" class={cn("text-muted-foreground hover:underline")}>{repo.openTaskCount} open tasks</a>
				</div>
				{#if repo.lastCommits.length > 0}
					<ul class={cn("mt-2 space-y-0.5 text-xs text-muted-foreground")}>
						{#each repo.lastCommits as commit}
							<li>{commit.subject} <span class={cn("opacity-60")}>{commit.relativeTime}</span></li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>
{/if}
</div>
