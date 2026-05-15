<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import MarkdownPreview from "$lib/components/markdown/MarkdownPreview.svelte";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
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

	function formatBytes(value: number): string {
		if (value < 1024) return `${value} B`;
		const kib = value / 1024;
		if (kib < 1024) return `${kib.toFixed(1)} KiB`;
		return `${(kib / 1024).toFixed(1)} MiB`;
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="detail" />
{:then payload}
	{@const doc = payload.doc}
	{@const backlinks = payload.backlinks ?? []}
	{@const comments = payload.comments ?? []}
	{@const attachments = payload.attachments ?? []}
	<header
		data-doc-detail-header
		class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
	>
		<div class={cn("flex items-baseline gap-3")}>
			<a href="/docs" data-back-docs class={cn("text-sm text-muted-foreground hover:underline")}>← Documents</a>
			<h1 data-doc-title class={cn("text-2xl font-semibold tracking-tight")}>{doc.title}</h1>
			<span data-doc-kind-pill class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{doc.kind}</span>
			{#if doc.project_id}
				<span data-doc-project class={cn("text-xs text-muted-foreground")}>{doc.project_id}</span>
			{/if}
		</div>
		<div class={cn("flex items-center gap-2")}>
			<span data-doc-updated class={cn("text-xs text-muted-foreground")}>Updated {formatUpdated(doc.updated_at)}</span>
			<a
				data-doc-history
				href="/docs/{doc.id}/history"
				class={cn(buttonVariants({ variant: "ghost" }), "text-xs")}
			>History</a>
			<a
				data-doc-edit
				href="/docs/{doc.id}/edit"
				class={cn(buttonVariants({ variant: "outline" }))}
			>Edit</a>
		</div>
	</header>

	<div class={cn("grid grid-cols-[1fr_minmax(0,200px)] gap-6")}>
		<div>
			<MarkdownPreview value={doc.body} />
		</div>
		{#if backlinks.length > 0}
			<aside data-backlinks-sidebar class={cn("flex flex-col gap-2")}>
				<h2 class={cn("text-sm font-semibold text-muted-foreground")}>Backlinks</h2>
				{#each backlinks as link (link.id)}
					<a
						href={link.href}
						data-backlink
						class={cn("text-sm hover:underline")}
					>{link.title}</a>
				{/each}
			</aside>
		{/if}
	</div>

	{#if attachments.length > 0}
		<section data-doc-attachments class={cn("mt-8 border-t border-border pt-5")}>
			<div class={cn("mb-3 flex items-center justify-between gap-3")}>
				<h2 class={cn("text-sm font-semibold text-muted-foreground")}>Attachments</h2>
				<span class={cn("text-xs text-muted-foreground")}>{attachments.length} total</span>
			</div>
			<div class={cn("flex flex-col divide-y divide-border rounded-md border border-border")}>
				{#each attachments as attachment (attachment.id)}
					<a
						data-doc-attachment={attachment.id}
						href={attachment.href}
						class={cn("flex items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-muted")}
					>
						<span class={cn("min-w-0 truncate font-medium")}>{attachment.fileName}</span>
						<span class={cn("shrink-0 text-xs text-muted-foreground")}>
							{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section data-doc-comments class={cn("mt-8 border-t border-border pt-5")}>
		<div class={cn("mb-4 flex items-center justify-between gap-3")}>
			<h2 class={cn("text-sm font-semibold text-muted-foreground")}>Comments</h2>
			<span class={cn("text-xs text-muted-foreground")}>{comments.length} total</span>
		</div>

		<div class={cn("flex flex-col gap-3")}>
			{#each comments as comment (comment.id)}
				<article
					data-doc-comment={comment.id}
					data-doc-comment-resolved={comment.resolved ? "true" : "false"}
					class={cn("border-l border-border pl-3")}
				>
					<div class={cn("mb-1 flex items-center gap-2 text-xs text-muted-foreground")}>
						<span>{comment.authorId}</span>
						{#if comment.resolved}
							<span>Resolved</span>
						{:else}
							<form method="POST" action="?/resolveComment" use:enhance>
								<input type="hidden" name="commentId" value={comment.id} />
								<button
									type="submit"
									class={cn("text-xs font-medium text-foreground hover:underline")}
								>Resolve</button>
							</form>
						{/if}
					</div>
					<p class={cn("whitespace-pre-wrap text-sm")}>{comment.bodyMd}</p>
				</article>
			{/each}
		</div>

		<form
			method="POST"
			action="?/createComment"
			use:enhance
			data-create-comment-form
			class={cn("mt-4 flex flex-col gap-2")}
		>
			<textarea
				name="bodyMd"
				rows="3"
				class={cn("min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm")}
			></textarea>
			<button
				type="submit"
				class={cn("inline-flex h-8 w-fit items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}
			>Add comment</button>
		</form>
	</section>

	<div class={cn("my-8 border-t border-border")}></div>

	<div
		data-danger-zone
		class={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-4")}
	>
		<h2 class={cn("text-sm font-semibold text-destructive")}>Danger zone</h2>
		<p class={cn("mt-1 text-xs text-muted-foreground")}>
			Deleting <strong>{doc.title}</strong> removes the document and clears its event history.
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
{/await}
