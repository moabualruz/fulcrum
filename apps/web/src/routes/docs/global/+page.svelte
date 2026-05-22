<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";
	import type { DocTreeNode } from "$lib/server/doc-tree";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let expandedIds = $state<Set<string>>(new Set());
	let draggedDocId = $state<string | null>(null);

	function toggleExpand(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	function movePosition(siblings: DocTreeNode[], index: number, direction: "up" | "down"): number {
		const neighbor = siblings[direction === "up" ? index - 1 : index + 1];
		if (!neighbor) return siblings[index]?.sort_order ?? 0;
		return direction === "up" ? neighbor.sort_order - 0.5 : neighbor.sort_order + 0.5;
	}

	function handleDragStart(event: DragEvent, node: DocTreeNode): void {
		draggedDocId = node.id;
		event.dataTransfer?.setData("text/plain", node.id);
		event.dataTransfer?.setData("application/x-fulcrum-doc-id", node.id);
	}

	async function handleDrop(event: DragEvent, target: DocTreeNode): Promise<void> {
		event.preventDefault();
		const docId = event.dataTransfer?.getData("application/x-fulcrum-doc-id") || draggedDocId;
		draggedDocId = null;
		if (!docId || docId === target.id) return;

		const fd = new FormData();
		fd.set("docId", docId);
		fd.set("parentId", target.parent_id ?? "");
		fd.set("sortPosition", String(target.sort_order - 0.5));
		await fetch("?/reorder", { method: "POST", body: fd });
		window.location.reload();
	}
</script>

<header
	data-global-docs-header
	class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-center gap-3")}>
		<a href="/docs" data-back-docs class={cn("text-sm text-muted-foreground hover:underline")}>← Documents</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Global documents</h1>
	</div>
	<a
		href="/docs/new"
		data-new-doc
		data-slot="button"
		class={cn(buttonVariants({ variant: "default" }), "gap-2")}
	>New document</a>
</header>

{#if data.error}
	<section
		data-global-docs-error
		role="alert"
		class={cn("rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm")}
	>
		<h2 class={cn("text-base font-semibold text-destructive")}>{data.error.message}</h2>
		<p class={cn("mt-1 text-muted-foreground")}>Recovery: {data.error.recovery}</p>
		<p class={cn("mt-1 font-mono text-xs text-muted-foreground")}>trace: {data.error.traceId}</p>
		<a
			href="/docs/global"
			data-global-docs-error-retry
			class={cn(buttonVariants({ variant: "outline" }), "mt-3 inline-flex")}
		>Retry</a>
	</section>
{:else if data.tree.length === 0}
	<div
		data-empty-global
		class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
	>No global documents yet.</div>
{:else}
	<nav data-doc-tree aria-label="Document tree" role="list">
		{#snippet treeNode(node: DocTreeNode, depth: number, siblings: DocTreeNode[], index: number)}
			<div
				data-tree-item
				data-doc-id={node.id}
				role="listitem"
				draggable="true"
				ondragstart={(event) => handleDragStart(event, node)}
				ondragover={(event) => event.preventDefault()}
				ondrop={(event) => handleDrop(event, node)}
				class={cn("flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted/50")}
				style="padding-left: {depth * 1.25 + 0.5}rem"
			>
				{#if node.children.length > 0}
					<button
						type="button"
						data-tree-toggle
						aria-expanded={expandedIds.has(node.id)}
						onclick={() => toggleExpand(node.id)}
						class={cn("h-5 w-5 flex items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted")}
					>{expandedIds.has(node.id) ? "▼" : "▶"}</button>
				{:else}
					<span class={cn("h-5 w-5")}></span>
				{/if}
				<a href="/docs/{node.id}" class={cn("flex-1 hover:underline")}>{node.title}</a>
				<span class={cn("rounded bg-muted px-1.5 py-0.5 text-xs")}>{node.kind}</span>
				<form method="POST" action="?/reorder" use:enhance class={cn("contents")}>
					<input type="hidden" name="docId" value={node.id} />
					<input type="hidden" name="parentId" value={node.parent_id ?? ""} />
					<input type="hidden" name="sortPosition" value={movePosition(siblings, index, "up")} />
					<button
						type="submit"
						data-tree-move-up
						aria-label="Move {node.title} up"
						disabled={index === 0}
						class={cn("h-6 w-6 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30")}
					>↑</button>
				</form>
				<form method="POST" action="?/reorder" use:enhance class={cn("contents")}>
					<input type="hidden" name="docId" value={node.id} />
					<input type="hidden" name="parentId" value={node.parent_id ?? ""} />
					<input type="hidden" name="sortPosition" value={movePosition(siblings, index, "down")} />
					<button
						type="submit"
						data-tree-move-down
						aria-label="Move {node.title} down"
						disabled={index === siblings.length - 1}
						class={cn("h-6 w-6 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30")}
					>↓</button>
				</form>
			</div>
			{#if expandedIds.has(node.id)}
				{#each node.children as child, childIndex (child.id)}
					{@render treeNode(child, depth + 1, node.children, childIndex)}
				{/each}
			{/if}
		{/snippet}

		{#each data.tree as node, index (node.id)}
			{@render treeNode(node, 0, data.tree, index)}
		{/each}
	</nav>
{/if}
