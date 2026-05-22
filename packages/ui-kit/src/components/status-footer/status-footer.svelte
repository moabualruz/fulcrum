<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";
	import { cn, type WithElementRef } from "../../utils.js";

	/** Footer density (DESIGN.md §3.1: compact 38 / base 44 / comfortable 50). */
	export type StatusFooterMode = "compact" | "base" | "comfortable";

	const MODE_HEIGHT: Record<StatusFooterMode, string> = {
		compact: "h-[38px]",
		base: "h-11",
		comfortable: "h-[50px]",
	};

	/** A single left-cluster segment (mode pill · profile · branch · run · agent · MCP). */
	export type StatusFooterSegment = {
		id: string;
		label: string;
		/** Optional small leading glyph / dot. */
		glyph?: string;
		/** Render the segment label as a pill (used for the input-mode pill). */
		pill?: boolean;
	};

	export type StatusFooterProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** Footer density (DESIGN.md §3.1). */
		mode?: StatusFooterMode;
		/** Left cluster segments. */
		segments?: StatusFooterSegment[];
		/** Visible label for the right-most AI Assist trigger segment. */
		aiAssistLabel?: string;
		/** Keyboard hint shown in the AI Assist segment (DESIGN.md §3.1: ⌘/). */
		aiAssistShortcut?: string;
		/** Right-cluster slot (trace badge · clock · help · palette) placed before AI Assist. */
		rightCluster?: Snippet;
		onAiAssist?: () => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		mode = $bindable("base"),
		segments = [],
		aiAssistLabel = "AI Assist",
		aiAssistShortcut = "⌘/",
		rightCluster,
		onAiAssist,
		class: className,
		...restProps
	}: StatusFooterProps = $props();
</script>

<footer
	bind:this={ref}
	role="contentinfo"
	aria-label="Status footer"
	data-slot="status-footer"
	data-footer-mode={mode}
	class={cn(
		"flex items-center gap-0 border-t border-border bg-surface-elevated px-2 text-xs text-fg-subtle",
		MODE_HEIGHT[mode],
		className,
	)}
	{...restProps}
>
	{#each segments as segment (segment.id)}
		<span
			data-slot="status-footer-segment"
			data-segment-id={segment.id}
			class="flex items-center gap-1.5 px-2.5"
		>
			{#if segment.glyph}
				<span aria-hidden="true" class="text-[10px] text-fg-muted">{segment.glyph}</span>
			{/if}
			{#if segment.pill}
				<span
					data-slot="status-footer-pill"
					class="rounded-sm border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-fg"
					>{segment.label}</span
				>
			{:else}
				<span>{segment.label}</span>
			{/if}
		</span>
	{/each}

	<span class="flex-1"></span>

	{#if rightCluster}
		<span data-slot="status-footer-right" class="flex items-center gap-2 px-2">
			{@render rightCluster()}
		</span>
	{/if}

	<button
		type="button"
		data-slot="status-footer-ai-assist"
		aria-label="{aiAssistLabel} ({aiAssistShortcut})"
		class="flex h-full items-center gap-1.5 border-l-2 border-accent bg-surface-sunken px-3 font-medium text-accent transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		onclick={() => onAiAssist?.()}
	>
		<span aria-hidden="true">⊞</span>
		<span>{aiAssistLabel}</span>
		<kbd
			data-slot="status-footer-ai-assist-kbd"
			class="rounded-sm border border-border px-1 font-mono text-[10px] text-fg-subtle"
			>{aiAssistShortcut}</kbd
		>
	</button>
</footer>
