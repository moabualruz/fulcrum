<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type EmptyStateProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title: string;
		description?: string;
		icon?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		title,
		description,
		icon,
		actions,
		class: className,
		children,
		...restProps
	}: EmptyStateProps = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-state"
	role="status"
	aria-label={title}
	class={cn(
		"flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-6 py-10 text-center",
		className,
	)}
	{...restProps}
>
	{#if icon}
		<div
			data-slot="empty-state-icon"
			aria-hidden="true"
			class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			{@render icon?.()}
		</div>
	{/if}
	<div class="max-w-md space-y-1">
		<h3 data-slot="empty-state-title" class="text-base font-semibold text-foreground">
			{title}
		</h3>
		{#if description}
			<p data-slot="empty-state-description" class="text-sm text-muted-foreground">
				{description}
			</p>
		{/if}
	</div>
	{#if children}
		<div data-slot="empty-state-extra">{@render children?.()}</div>
	{/if}
	{#if actions}
		<div data-slot="empty-state-actions" class="flex flex-wrap items-center justify-center gap-2">
			{@render actions?.()}
		</div>
	{/if}
</div>
