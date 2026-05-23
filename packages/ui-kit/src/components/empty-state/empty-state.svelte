<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	/**
	 * `absence`: the surface has no data yet (the default zero-data branch).
	 * `steady`: the surface is intentionally empty as a healthy steady state
	 * (e.g. Operate doctor with every subsystem passing). cross-states.md:
	 * "empty is not always absence, it can be a healthy steady state".
	 */
	export type EmptyStateTone = "absence" | "steady";

	export type EmptyStateProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title: string;
		description?: string;
		/** Keyboard hint shown beside the primary action: DESIGN.md §4.8. */
		keyHint?: string;
		tone?: EmptyStateTone;
		icon?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		title,
		description,
		keyHint,
		tone = "absence",
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
	data-tone={tone}
	role="status"
	aria-label={title}
	class={cn(
		"flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-6 py-10 text-center",
		tone === "steady" && "border-solid border-success/40 bg-success/5",
		className,
	)}
	{...restProps}
>
	{#if icon}
		<div
			data-slot="empty-state-icon"
			aria-hidden="true"
			class={cn(
				"flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground",
				tone === "steady" && "bg-success/10 text-success",
			)}
		>
			{@render icon?.()}
		</div>
	{/if}
	<div class="max-w-md space-y-1">
		<h2 data-slot="empty-state-title" class="text-base font-semibold text-foreground">
			{title}
		</h2>
		{#if description}
			<p data-slot="empty-state-description" class="text-sm text-muted-foreground">
				{description}
			</p>
		{/if}
	</div>
	{#if children}
		<div data-slot="empty-state-extra">{@render children?.()}</div>
	{/if}
	{#if actions || keyHint}
		<div
			data-slot="empty-state-actions"
			class="flex flex-wrap items-center justify-center gap-2"
		>
			{#if actions}
				{@render actions?.()}
			{/if}
			{#if keyHint}
				<span data-slot="empty-state-key-hint" class="text-xs text-muted-foreground">
					{keyHint}
				</span>
			{/if}
		</div>
	{/if}
</div>
