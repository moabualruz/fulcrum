<script lang="ts">
	import type { PageData } from "./$types";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";
	import type { DocTreeNode } from "$lib/server/doc-tree";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let expandedIds = $state<Set<string>>(new Set());

	function toggleExpand(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
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

{#if data.tree.length === 0}
	<div
		data-empty-global
		class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
	>No global documents yet.</div>
{:else}
	<nav data-doc-tree aria-label="Document tree">
		{#snippet treeNode(node: DocTreeNode, depth: number)}
			<div
				data-tree-item
				data-doc-id={node.id}
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
			</div>
			{#if expandedIds.has(node.id)}
				{#each node.children as child (child.id)}
					{@render treeNode(child, depth + 1)}
				{/each}
			{/if}
		{/snippet}

		{#each data.tree as node (node.id)}
			{@render treeNode(node, 0)}
		{/each}
	</nav>
{/if}
