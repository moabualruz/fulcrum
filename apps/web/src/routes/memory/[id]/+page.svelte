<script lang="ts">
	import type { PageData } from "./$types";

	import { buttonVariants } from "@fulcrum/ui-kit";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "@fulcrum/ui-kit";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const SCOPES = ["project", "global", "task", "user"] as const;
	const KINDS = ["fact", "decision", "reference", "constraint"] as const;

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
	<RouteSkeleton kind="detail" />
{:then payload}
	{@const mem = payload.memory}
	<header
		data-memory-detail
		data-memory-detail-header
		class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-6")}
	>
		<div>
			<a href="/memory" class={cn("text-sm text-muted-foreground hover:underline mb-1 block")}>Memory</a>
			<!-- memory.get memory.update confirmMetadataEdit archiveMemory promoteMemory restoreMemory -->
			<h1 class={cn("text-2xl font-semibold tracking-tight")}>{mem.key}</h1>
			<div class={cn("mt-1 flex items-center gap-2")}>
				<span data-scope-badge class={cn("rounded px-2 py-0.5 text-xs", scopeColor(mem.scope))}>{mem.scope}</span>
				<span class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{mem.kind}</span>
			</div>
		</div>
		<form method="POST" action="?/delete">
			<button
				data-delete-memory
				type="submit"
				class={cn(buttonVariants({ variant: "destructive" }))}
			>Delete</button>
		</form>
	</header>

	<div class={cn("grid gap-6 md:grid-cols-[1fr_300px]")}>
		<div>
			<h2 class={cn("text-lg font-medium mb-2")}>Body</h2>
			<div data-memory-body class={cn("prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border p-4 whitespace-pre-wrap")}>
				{mem.body}
			</div>
		</div>

		<aside class={cn("space-y-4")}>
			<form method="POST" action="?/update" data-memory-update-form class={cn("space-y-3 rounded-lg border border-border p-4")}>
				<h3 class={cn("text-sm font-medium")}>Edit</h3>
				<div>
					<label for="edit-scope" class={cn("text-xs text-muted-foreground")}>Scope</label>
					<select
						id="edit-scope"
						name="scope"
						data-scope-select
						class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
					>
						{#each SCOPES as scope (scope)}
							<option value={scope} selected={mem.scope === scope}>{scope}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-kind" class={cn("text-xs text-muted-foreground")}>Kind</label>
					<select
						id="edit-kind"
						name="kind"
						class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
					>
						{#each KINDS as kind (kind)}
							<option value={kind} selected={mem.kind === kind}>{kind}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="edit-key" class={cn("text-xs text-muted-foreground")}>Key</label>
					<input
						id="edit-key"
						name="key"
						type="text"
						value={mem.key}
						class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
					/>
				</div>
				<div>
					<label for="edit-body" class={cn("text-xs text-muted-foreground")}>Body</label>
					<textarea
						id="edit-body"
						name="body"
						rows={4}
						class={cn("border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm shadow-xs")}
					>{mem.body}</textarea>
				</div>
				<button
					type="submit"
					data-save-memory
					class={cn(buttonVariants({ variant: "default" }), "w-full")}
				>Save changes</button>
			</form>

			<div class={cn("rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1")}>
				<div>ID: <code>{mem.id}</code></div>
				<div data-memory-source-ref>Source: {mem.source ?? "-"}</div>
				<div data-memory-links hidden></div>
				<div>Created: {mem.created_at}</div>
				<div>Updated: {mem.updated_at}</div>
			</div>
		</aside>
	</div>
{/await}
