<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type StatTrend = "up" | "down" | "flat";

	export type StatProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value: string;
		delta?: string;
		trend?: StatTrend;
		hint?: string;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		label,
		value,
		delta,
		trend = "flat",
		hint,
		class: className,
		...restProps
	}: StatProps = $props();

	const trendClass: Record<StatTrend, string> = {
		up: "text-success",
		down: "text-destructive",
		flat: "text-muted-foreground",
	};

	const trendGlyph: Record<StatTrend, string> = {
		up: "▲",
		down: "▼",
		flat: "■",
	};
</script>

<div
	bind:this={ref}
	data-slot="stat"
	data-trend={trend}
	class={cn("rounded-md border border-border bg-card p-4", className)}
	{...restProps}
>
	<p
		data-slot="stat-label"
		class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
	>
		{label}
	</p>
	<p data-slot="stat-value" class="mt-1 text-2xl font-semibold tabular-nums text-foreground">
		{value}
	</p>
	{#if delta}
		<p
			data-slot="stat-delta"
			class={cn("mt-1 flex items-center gap-1 text-xs font-medium", trendClass[trend])}
		>
			<span aria-hidden="true">{trendGlyph[trend]}</span>
			<span>{delta}</span>
		</p>
	{/if}
	{#if hint}
		<p data-slot="stat-hint" class="mt-1 text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
