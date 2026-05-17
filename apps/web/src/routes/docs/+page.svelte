<script lang="ts">
	import type { PageData } from "./$types";

	import { buttonVariants } from "$lib/components/ui/button";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import DocTree from "$lib/components/docs/DocTree.svelte";
	import InContextSearchBar from "$lib/components/search/InContextSearchBar.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const KINDS = ["decision", "spec", "note", "runbook"] as const;

	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}

	function projectLabel(id: string | null): string {
		return id ? id : "—";
	}

	function autoSubmit(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		select.form?.requestSubmit();
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="list" />
{:then payload}
	<header
		data-docs-header
		class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
	>
		<div class={cn("flex items-center gap-3")}>
			<h1 class={cn("text-2xl font-semibold tracking-tight")}>Documents</h1>
			<a
				href="/docs/global"
				data-global-tree
				class={cn("text-sm text-muted-foreground hover:underline")}
			>Global tree</a>
		</div>
		<a
			href="/docs/new"
			data-new-doc
			data-slot="button"
			class={cn(buttonVariants({ variant: "default" }), "gap-2")}
		>New document</a>
	</header>

	<div class={cn("mb-3")}>
		<InContextSearchBar
			kind="doc"
			projectId={data.activeProjectId}
			orgId={data.orgId}
			placeholder="Search documents"
		/>
	</div>

	<div
		data-docs-hub
		data-testid="docs-sidebar"
		class={cn("mb-4 grid gap-3 lg:grid-cols-2")}
	>
		<div data-project-doc-tree>
			<DocTree title="Project docs" scope="project" nodes={payload.projectTree ?? []} />
		</div>
		<div data-global-doc-tree>
			<DocTree title="Global docs" scope="global" nodes={payload.globalTree ?? []} />
		</div>
	</div>

	<form
		data-docs-filter
		method="GET"
		class={cn("mb-3 flex flex-wrap items-center gap-2")}
	>
		<select
			data-kind-filter
			name="kind"
			onchange={autoSubmit}
			class={cn(
				"border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs",
			)}
		>
			<option value="" selected={data.kind === ""}>All kinds</option>
			{#each KINDS as kind (kind)}
				<option value={kind} selected={data.kind === kind}>{kind}</option>
			{/each}
		</select>
		<input
			data-q-filter
			type="search"
			name="q"
			aria-label="Filter documents by text"
			placeholder="Filter by text"
			value={data.q}
			class={cn(
				"border-input bg-background placeholder:text-muted-foreground flex h-9 w-full max-w-sm rounded-md border px-3 py-1 text-sm shadow-xs",
			)}
		/>
		<button
			type="submit"
			class={cn(buttonVariants({ variant: "outline" }))}
		>Apply</button>
	</form>

	{#if payload.documents.length === 0 && data.kind === "" && data.q === ""}
		<div
			data-empty-docs
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>No documents yet — create one.</div>
	{:else if payload.documents.length === 0}
		<div
			data-empty-filter
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>No documents match your filter.</div>
	{:else}
		<div data-slot="table-container" class={cn("relative w-full overflow-x-auto")}>
			<table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
				<thead data-slot="table-header" class={cn("[&_tr]:border-b")}>
					<tr data-slot="table-row" class={cn("border-b transition-colors")}>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Title</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Kind</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Project</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Updated</th>
					</tr>
				</thead>
				<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
					{#each payload.documents as doc (doc.id)}
						<tr
							data-slot="table-row"
							data-doc-row
							data-doc-id={doc.id}
							class={cn("hover:bg-muted/50 border-b transition-colors")}
						>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
								<a href="/docs/{doc.id}" class={cn("hover:underline")}>{doc.title}</a>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle")}>
								<span class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{doc.kind}</span>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{projectLabel(doc.project_id)}</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{formatUpdated(doc.updated_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/await}
