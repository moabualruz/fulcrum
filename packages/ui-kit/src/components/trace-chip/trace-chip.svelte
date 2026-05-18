<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type TraceChipProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		traceId: string;
		href?: string;
		short?: boolean;
		copyable?: boolean;
		onCopy?: (traceId: string) => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		traceId,
		href,
		short = true,
		copyable = true,
		onCopy,
		class: className,
		...restProps
	}: TraceChipProps = $props();

	const displayId = $derived(short && traceId.length > 12 ? `${traceId.slice(0, 6)}…${traceId.slice(-4)}` : traceId);

	async function copy() {
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				await navigator.clipboard.writeText(traceId);
			}
		} catch {
			// Clipboard unavailable; surface via onCopy callback regardless.
		}
		onCopy?.(traceId);
	}
</script>

<span
	bind:this={ref}
	data-slot="trace-chip"
	data-trace-id={traceId}
	class={cn(
		"inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground",
		className,
	)}
	{...restProps}
>
	<span aria-hidden="true" class="text-[10px]">◷</span>
	{#if href}
		<a href={href} class="hover:text-foreground focus-visible:underline focus-visible:outline-none">
			{displayId}
		</a>
	{:else}
		<span>{displayId}</span>
	{/if}
	{#if copyable}
		<button
			type="button"
			aria-label="Copy trace id"
			data-slot="trace-chip-copy"
			class="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			onclick={copy}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 12 12"
				class="size-3"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="3" width="6" height="6" rx="1" />
				<path d="M5 1.5h4.5V6" />
			</svg>
		</button>
	{/if}
</span>
