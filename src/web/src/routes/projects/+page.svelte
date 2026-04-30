<script lang="ts">
	import type { PageData } from "./$types";

	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let filter = $state("");

	function truncate(value: string | null, max = 80): string {
		if (!value) return "";
		return value.length > max ? `${value.slice(0, max - 1)}…` : value;
	}

	// Render `updated_at` as an ISO short stamp (`YYYY-MM-DD HH:mm`). Keeps the
	// table column predictable across timezones — the live shell layout already
	// renders the user-local clock elsewhere; this column tracks the kernel's
	// stored timestamp.
	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}

	let visible = $derived.by(() => {
		const needle = filter.trim().toLowerCase();
		if (needle === "") return data.projects;
		return data.projects.filter(
			(p) =>
				p.name.toLowerCase().includes(needle) ||
				p.slug.toLowerCase().includes(needle),
		);
	});
</script>

<header
	data-projects-header
	class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<h1 class={cn("text-2xl font-semibold tracking-tight")}>Projects</h1>
	<a
		href="/projects/new"
		data-new-project
		data-slot="button"
		class={cn(buttonVariants({ variant: "default" }), "gap-2")}
	>New project</a>
</header>

<div class={cn("mb-3")}>
	<input
		type="search"
		data-projects-filter
		placeholder="Filter projects"
		bind:value={filter}
		class={cn(
			"border-input bg-background placeholder:text-muted-foreground flex h-9 w-full max-w-sm rounded-md border px-3 py-1 text-sm shadow-xs",
		)}
	/>
</div>

{#if data.projects.length === 0}
	<div
		data-empty-projects
		class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
	>No projects yet — create one.</div>
{:else if visible.length === 0}
	<div
		data-empty-filter
		class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
	>No projects match "{filter}".</div>
{:else}
	<div data-slot="table-container" class={cn("relative w-full overflow-x-auto")}>
		<table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
			<thead data-slot="table-header" class={cn("[&_tr]:border-b")}>
				<tr data-slot="table-row" class={cn("border-b transition-colors")}>
					<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Name</th>
					<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Slug</th>
					<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Description</th>
					<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Updated</th>
				</tr>
			</thead>
			<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
				{#each visible as project (project.id)}
					<tr
						data-slot="table-row"
						data-project-row
						data-project-id={project.id}
						class={cn("hover:bg-muted/50 border-b transition-colors")}
					>
						<td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
							<a href="/projects/{project.id}" class={cn("hover:underline")}>{project.name}</a>
						</td>
						<td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{project.slug}</td>
						<td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{truncate(project.description)}</td>
						<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{formatUpdated(project.updated_at)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
