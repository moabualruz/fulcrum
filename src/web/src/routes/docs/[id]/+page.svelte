<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import MarkdownPreview from "$lib/components/markdown/MarkdownPreview.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let showConfirm = $state(false);

	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}
</script>

<header
	data-doc-detail-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a href="/docs" data-back-docs class={cn("text-sm text-muted-foreground hover:underline")}>← Documents</a>
		<h1 data-doc-title class={cn("text-2xl font-semibold tracking-tight")}>{data.doc.title}</h1>
		<span data-doc-kind-pill class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{data.doc.kind}</span>
		{#if data.doc.project_id}
			<span data-doc-project class={cn("text-xs text-muted-foreground")}>{data.doc.project_id}</span>
		{/if}
	</div>
	<div class={cn("flex items-center gap-2")}>
		<span data-doc-updated class={cn("text-xs text-muted-foreground")}>Updated {formatUpdated(data.doc.updated_at)}</span>
		<a
			data-doc-edit
			href="/docs/{data.doc.id}/edit"
			class={cn(buttonVariants({ variant: "outline" }))}
		>Edit</a>
	</div>
</header>

<MarkdownPreview value={data.doc.body} />

<div class={cn("my-8 border-t border-border")}></div>

<div
	data-danger-zone
	class={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-4")}
>
	<h2 class={cn("text-sm font-semibold text-destructive")}>Danger zone</h2>
	<p class={cn("mt-1 text-xs text-muted-foreground")}>
		Deleting <strong>{data.doc.title}</strong> removes the document and clears its event history.
	</p>
	<button
		type="button"
		data-danger-trigger
		data-state={showConfirm ? "open" : "closed"}
		onclick={() => (showConfirm = true)}
		class={cn("mt-3 inline-flex h-9 items-center rounded-md border border-destructive/60 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20")}
	>Delete document</button>

	<div
		data-danger-confirm
		hidden={!showConfirm}
		class={cn("mt-3 flex flex-col gap-2 rounded-md border border-destructive/40 bg-background p-3")}
	>
		<p class={cn("text-xs text-muted-foreground")}>This action cannot be undone.</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			data-delete-form
			class={cn("flex items-center gap-2")}
		>
			<button
				type="button"
				data-delete-cancel
				onclick={() => (showConfirm = false)}
				class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}
			>Cancel</button>
			<button
				type="submit"
				data-delete-submit
				class={cn("inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90")}
			>Delete forever</button>
		</form>
	</div>
</div>
