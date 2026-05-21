<script lang="ts">
	import type { PageData } from "./$types";

	import { buttonVariants } from "@fulcrum/ui-kit";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const SCOPES = ["project", "global", "task", "user"] as const;
	const KINDS = ["fact", "decision", "reference", "constraint"] as const;

	let showCreate = $state(false);

	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}

	function autoSubmit(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		select.form?.requestSubmit();
	}

	function scopeColor(scope: string): string {
		switch (scope) {
			case "global": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
			case "project": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
			case "task": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
			case "user": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
			default: return "bg-muted";
		}
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="list" />
{:then payload}
	<header
		data-memory-browser
		data-testid="memory-browser"
		data-memory-header
		class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
	>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Memory</h1>
		<button
			data-create-memory
			type="button"
			onclick={() => (showCreate = !showCreate)}
			class={cn(buttonVariants({ variant: "default" }), "gap-2")}
		>
			{showCreate ? "Cancel" : "Create memory"}
		</button>
	</header>

	{#if showCreate}
		<form
			data-memory-create-form
			method="POST"
			action="?/create"
			class={cn("mb-6 rounded-lg border border-border p-4 space-y-3")}
		>
			<div class={cn("grid gap-3 md:grid-cols-2")}>
				<div>
					<label for="mem-key" class={cn("text-sm font-medium")}>Key</label>
					<input
						id="mem-key"
						name="key"
						type="text"
						required
						placeholder="e.g. db-engine"
						class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
					/>
				</div>
				<div class={cn("grid grid-cols-2 gap-3")}>
					<div>
						<label for="mem-scope" class={cn("text-sm font-medium")}>Scope</label>
						<select
							id="mem-scope"
							name="scope"
							class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
						>
							{#each SCOPES as scope (scope)}
								<option value={scope}>{scope}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="mem-kind" class={cn("text-sm font-medium")}>Kind</label>
						<select
							id="mem-kind"
							name="kind"
							class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
						>
							{#each KINDS as kind (kind)}
								<option value={kind}>{kind}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
			<div>
				<label for="mem-body" class={cn("text-sm font-medium")}>Body</label>
				<textarea
					id="mem-body"
					name="body"
					required
					rows={3}
					placeholder="Memory content (markdown supported)"
					class={cn("border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm shadow-xs")}
				></textarea>
			</div>
			<button
				type="submit"
				class={cn(buttonVariants({ variant: "default" }))}
			>Save memory</button>
		</form>
	{/if}

	<form
		data-memory-filter
		data-memory-filter-project
		data-memory-filter-kind
		data-memory-filter-importance
		data-memory-filter-tags
		data-memory-filter-date-range
		data-memory-filter-source
		data-memory-filter-archived
		method="GET"
		class={cn("mb-3 flex flex-wrap items-center gap-2")}
	>
		<select
			data-scope-filter
			data-testid="memory-search"
			name="scope"
			aria-label="Memory scope"
			onchange={autoSubmit}
			class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		>
			<option value="" selected={data.scope === ""}>All scopes</option>
			{#each SCOPES as scope (scope)}
				<option value={scope} selected={data.scope === scope}>{scope}</option>
			{/each}
		</select>
		<select
			data-kind-filter
			name="kind"
			aria-label="Memory kind"
			onchange={autoSubmit}
			class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
		>
			<option value="" selected={data.kind === ""}>All kinds</option>
			{#each KINDS as kind (kind)}
				<option value={kind} selected={data.kind === kind}>{kind}</option>
			{/each}
		</select>
		<button
			type="submit"
			class={cn(buttonVariants({ variant: "outline" }))}
		>Apply</button>
	</form>

	<div data-memory-bulk-bar hidden></div>
	<!-- memory.list memory.search bulkPromote bulkArchive bulkTag -->

	{#if payload.memories.length === 0}
		<div
			data-empty-memories
			class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
		>No memories yet — create one.</div>
	{:else}
		<div data-slot="table-container" class={cn("relative w-full overflow-x-auto")}>
			<table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
				<thead data-slot="table-header" class={cn("[&_tr]:border-b")}>
					<tr data-slot="table-row" class={cn("border-b transition-colors")}>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Key</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Scope</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Kind</th>
						<th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Updated</th>
					</tr>
				</thead>
				<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
					{#each payload.memories as mem (mem.id)}
						<tr
							data-slot="table-row"
							data-memory-row
							data-memory-id={mem.id}
							class={cn("hover:bg-muted/50 border-b transition-colors")}
						>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
								<a href="/memory/{mem.id}" class={cn("hover:underline")}>{mem.key}</a>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle")}>
								<span class={cn("rounded px-2 py-0.5 text-xs", scopeColor(mem.scope))}>{mem.scope}</span>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle")}>
								<span class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{mem.kind}</span>
							</td>
							<td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{formatUpdated(mem.updated_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/await}
