<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type TreeNode = {
		id: string;
		label: string;
		hint?: string;
		children?: TreeNode[];
	};

	export type TreeViewProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		nodes: TreeNode[];
		expandedIds?: Set<string>;
		selectedId?: string;
		onToggle?: (id: string) => void;
		onSelect?: (id: string) => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		nodes,
		expandedIds = $bindable(new Set<string>()),
		selectedId = $bindable<string | undefined>(undefined),
		onToggle,
		onSelect,
		class: className,
		...restProps
	}: TreeViewProps = $props();

	function toggle(id: string) {
		if (expandedIds.has(id)) {
			expandedIds.delete(id);
		} else {
			expandedIds.add(id);
		}
		expandedIds = new Set(expandedIds);
		onToggle?.(id);
	}

	function select(id: string) {
		selectedId = id;
		onSelect?.(id);
	}
</script>

{#snippet renderNode(node: TreeNode, level: number)}
	{@const hasChildren = (node.children?.length ?? 0) > 0}
	{@const isExpanded = expandedIds.has(node.id)}
	{@const isSelected = selectedId === node.id}
	<li
		role="treeitem"
		aria-expanded={hasChildren ? isExpanded : undefined}
		aria-selected={isSelected}
		data-slot="tree-view-item"
		data-id={node.id}
		data-level={level}
		data-selected={isSelected ? "true" : undefined}
		class="grid gap-1"
	>
		<div
			class={cn(
				"flex items-center gap-1 rounded-sm px-1.5 py-1 text-sm hover:bg-muted/60",
				isSelected && "bg-muted text-foreground",
			)}
			style:padding-left="{level * 1.25 + 0.375}rem"
		>
			{#if hasChildren}
				<button
					type="button"
					data-slot="tree-view-toggle"
					data-id={node.id}
					aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
					class="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/5"
					onclick={() => toggle(node.id)}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 12 12"
						class={cn("size-3 transition-transform", isExpanded && "rotate-90")}
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M4 3l3 3-3 3" />
					</svg>
				</button>
			{:else}
				<span class="size-5" aria-hidden="true"></span>
			{/if}
			<button
				type="button"
				data-slot="tree-view-label"
				data-id={node.id}
				class="flex-1 truncate text-left"
				onclick={() => select(node.id)}
			>
				{node.label}
				{#if node.hint}
					<span class="ml-2 text-xs text-muted-foreground">{node.hint}</span>
				{/if}
			</button>
		</div>
		{#if hasChildren && isExpanded}
			<ul role="group" class="grid gap-1">
				{#each node.children! as child (child.id)}
					{@render renderNode(child, level + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<ul
	bind:this={ref}
	role="tree"
	data-slot="tree-view"
	class={cn("grid gap-1", className)}
	{...restProps}
>
	{#each nodes as node (node.id)}
		{@render renderNode(node, 0)}
	{/each}
</ul>
