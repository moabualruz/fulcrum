<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type DataListItem = {
		label: string;
		value: string;
		hint?: string;
	};

	export type DataListProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		items: DataListItem[];
		variant?: "stacked" | "inline";
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		items,
		variant = "stacked",
		class: className,
		...restProps
	}: DataListProps = $props();
</script>

<dl
	bind:this={ref}
	data-slot="data-list"
	data-variant={variant}
	class={cn(
		variant === "inline" ? "grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5" : "grid gap-3",
		className,
	)}
	{...restProps}
>
	{#each items as item, index (item.label + index)}
		<dt
			data-slot="data-list-label"
			class={cn(
				"text-xs font-medium uppercase tracking-wide text-muted-foreground",
				variant === "stacked" && "mb-0.5",
			)}
		>
			{item.label}
		</dt>
		<dd
			data-slot="data-list-value"
			class={cn("text-sm text-foreground", variant === "stacked" && "mb-2")}
		>
			<span>{item.value}</span>
			{#if item.hint}
				<span class="ml-2 text-xs text-muted-foreground">{item.hint}</span>
			{/if}
		</dd>
	{/each}
</dl>
