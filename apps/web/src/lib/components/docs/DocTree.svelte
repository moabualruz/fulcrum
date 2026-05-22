<script lang="ts">
	import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";

	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "@fulcrum/ui-kit";
	import { docTypeMeta, flattenDocTree, type DocScope, type DocTreeNode } from "./doc-tree";

	interface Props {
		title: string;
		scope: DocScope;
		nodes: DocTreeNode[];
		selectedDocId?: string | null;
		breadcrumbs?: DocTreeNode[];
	}

	let {
		title,
		scope,
		nodes,
		selectedDocId = null,
		breadcrumbs = [],
	}: Props = $props();

	const flatNodes = $derived(flattenDocTree(nodes));
</script>

<section
	data-doc-tree
	data-scope={scope}
	class={cn("min-w-0 rounded-md border border-border bg-background")}
>
	<header class={cn("flex items-center justify-between gap-2 border-b border-border px-3 py-2")}>
		<h2 class={cn("text-sm font-semibold")}>{title}</h2>
		<a
			href="/docs/new?scope={scope}"
			class={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
		>New</a>
	</header>

	{#if breadcrumbs.length > 0}
		<nav data-doc-breadcrumbs aria-label="Document breadcrumbs" class={cn("border-b border-border px-3 py-2 text-xs")}>
			<ol class={cn("flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground")}>
				{#each breadcrumbs as crumb, index (crumb.id)}
					<li class={cn("flex items-center gap-1")}>
						<a href="/docs/{crumb.id}" class={cn("truncate hover:text-foreground hover:underline")}>{crumb.title}</a>
						{#if index < breadcrumbs.length - 1}<span>/</span>{/if}
					</li>
				{/each}
			</ol>
		</nav>
	{/if}

	<div role="tree" aria-label={title} class={cn("max-h-[70vh] overflow-auto p-1")}>
		{#if flatNodes.length === 0}
			<p data-empty-doc-tree class={cn("px-2 py-6 text-sm text-muted-foreground")}>No documents.</p>
		{:else}
			{#each flatNodes as item (item.node.id)}
				{@const node = item.node}
				{@const meta = docTypeMeta(node.docType)}
				<div
					role="treeitem"
					aria-level={item.depth}
					aria-selected={selectedDocId === node.id}
					data-doc-node
					data-doc-node-id={node.id}
					data-doc-parent-id={node.parentId ?? ""}
					class={cn(
						"group flex min-h-9 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted",
						selectedDocId === node.id && "bg-muted font-medium",
					)}
					style={`padding-left: ${Math.max(0.5, item.depth * 0.875)}rem`}
				>
					<span
						data-doc-type-icon={node.docType}
						aria-label={meta.label}
						class={cn("grid size-5 shrink-0 place-items-center rounded text-[10px]")}
					>{meta.icon.slice(0, 1)}</span>
					<a href="/docs/{node.id}" class={cn("min-w-0 flex-1 truncate hover:underline")}>{node.title}</a>
					<span
						data-doc-type-badge={node.docType}
						class={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", meta.badgeClass)}
					>{meta.label}</span>
					<div data-doc-context-menu class={cn("flex shrink-0 items-center gap-1")}>
						<a
							href="/docs/new?parent_id={node.id}&scope={scope}"
							aria-label="Create child"
							class={cn("rounded px-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground")}
						>+</a>
						<a href="/docs/{node.id}/edit" class={cn("rounded px-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground")}>Rename</a>
						<button type="button" aria-label="More document actions" class={cn("rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground")}>
							<MoreHorizontalIcon class="size-4" />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>
