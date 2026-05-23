<script lang="ts">
	import type { PageData } from "./$types";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "@fulcrum/ui-kit";
	import type { FileTreeNode } from "./+page.server.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Track expanded dirs (client-side)
	let expanded = $state<Record<string, boolean>>({});

	function toggleDir(path: string) {
		expanded[path] = !expanded[path];
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="detail" />
{:then payload}
	{@const repo = payload.repo}

	<header
		data-files-header
		class={cn("flex items-center gap-2 border-b border-border pb-4 mb-6")}
	>
		<a href="/repos/{repo.id}" class={cn("text-muted-foreground hover:underline text-sm")}>{repo.slug}</a>
		<span class={cn("text-muted-foreground")}>/</span>
		<h1 class={cn("text-lg font-semibold tracking-tight")}>Files</h1>
	</header>

	<div class={cn("flex gap-6 min-h-0")}>
		<!-- File tree -->
		<aside data-file-tree class={cn("w-64 shrink-0 overflow-y-auto border-r border-border pr-4")}>
			{#snippet renderNode(node: FileTreeNode, depth: number)}
				{#if node.kind === "dir"}
					<div>
						<button
							data-dir-node
							data-path={node.path}
							onclick={() => toggleDir(node.path)}
							class={cn(
								"flex w-full items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-muted",
								"text-left",
							)}
							style={`padding-left: ${depth * 12 + 4}px`}
						>
							<span class={cn("text-muted-foreground text-xs")}>{expanded[node.path] ? "▾" : "▸"}</span>
							<span>{node.name}/</span>
						</button>
						{#if expanded[node.path]}
							{#each node.children as child (child.path)}
								{@render renderNode(child, depth + 1)}
							{/each}
						{/if}
					</div>
				{:else}
					<a
						href="?path={encodeURIComponent(node.path)}"
						data-file-node
						data-path={node.path}
						class={cn(
							"flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-muted",
							payload.filePath === node.path ? "bg-muted font-medium" : "",
						)}
						style={`padding-left: ${depth * 12 + 4}px`}
					>
						<span class={cn("text-muted-foreground text-xs w-10 shrink-0")}>.{node.ext}</span>
						<span class="truncate">{node.name}</span>
					</a>
				{/if}
			{/snippet}

			{#if payload.tree.length === 0}
				<p class={cn("text-sm text-muted-foreground p-2")}>No files found.</p>
			{:else}
				{#each payload.tree as node (node.path)}
					{@render renderNode(node, 0)}
				{/each}
			{/if}
		</aside>

		<!-- Content viewer -->
		<main data-file-content class={cn("flex-1 min-w-0")}>
			{#if !payload.filePath}
				<div class={cn("text-sm text-muted-foreground p-4")}>Select a file to view.</div>
			{:else if payload.isBinary}
				<div
					data-binary-placeholder
					class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
				>Binary file: preview not available.</div>
			{:else if payload.fileContent === null}
				<div class={cn("text-sm text-muted-foreground p-4")}>File not found or empty.</div>
			{:else}
				<div data-file-viewer class={cn("rounded-lg border border-border overflow-auto")}>
					<div class={cn("border-b border-border px-3 py-1 text-xs font-mono text-muted-foreground bg-muted/50")}>
						{payload.filePath}
					</div>
					<!-- Syntax highlight: shiki not available; use plain pre/code.
					     When shiki is added, replace this block with highlighted HTML. -->
					<pre
						data-code-block
						class={cn("p-4 text-xs font-mono overflow-x-auto whitespace-pre")}
					><code>{payload.fileContent}</code></pre>
				</div>
			{/if}
		</main>
	</div>
{/await}
